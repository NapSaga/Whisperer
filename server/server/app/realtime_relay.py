"""Realtime relay per la demo suggeritore — parla a un modello realtime speech-to-speech
(Grok Voice / OpenAI Realtime GA) invece della VoicePipeline, riusando il protocollo
audio che il frontend gia' parla.

Scoperta chiave: il frontend manda gia' ``input_audio_buffer.append``/``commit`` (PCM16)
e riproduce ``response.audio.delta`` — la stessa shape del Realtime API. Quindi qui
facciamo solo da ponte:  browser  <->  questo server  <->  provider realtime.

In piu' teniamo viva la memoria Whisperer anche sul realtime:
- iniettiamo il ledger (SPEC §1) come istruzioni di sessione (il modello "ricorda");
- catturiamo i transcript (utente + assistente), li distilliamo nel ledger ogni N turni
  (pannello "Memoria live" via ``send_state``);
- ri-iniettiamo il ledger aggiornato (session.update) — la re-grounding §3 sul realtime;
- misuriamo il costo reale con ``RealtimeCostMeter``.

Provider via ``REALTIME_PROVIDER`` (default ``xai`` = Grok Voice, compatibile con la spec
OpenAI Realtime). Attivato da ``SUGGERITORE_REALTIME=on``; se off, il server usa la
VoicePipeline come sempre (path invariato).

NB: non testabile senza una chiave con credito (XAI_API_KEY / OPENAI_API_KEY) + microfono.
La shape di sessione e' quella GA verificata dal probe; se il provider la rifiuta al primo
run reale, l'errore lo dice e si aggiusta in pochi punti (vedi ``_session_config``).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Optional

from whisperer import distiller, state_store
from whisperer.realtime_cost_meter import RealtimeCostMeter, parse_usage
from .cost_projection import CostProjector

logger = logging.getLogger(__name__)

# Provider realtime selezionabili. xai (Grok Voice) e' il default: compatibile con la
# spec OpenAI Realtime, basta cambiare base URL. openai resta disponibile.
_PROVIDERS = {
    "xai": {
        "url": "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
        "model": "grok-voice-latest",
        "price_model": "gpt-realtime-mini",  # proxy $ token-based; Grok ~ $0.05/min flat
        "key_envs": ("XAI_API_KEY", "GROK_API_KEY"),
        "voice": "eve",
    },
    "openai": {
        "url": "wss://api.openai.com/v1/realtime?model=gpt-realtime-mini",
        "model": "gpt-realtime-mini",
        "price_model": "gpt-realtime-mini",
        "key_envs": ("OPENAI_API_KEY",),
        "voice": "shimmer",
    },
}


def is_enabled() -> bool:
    return os.getenv("SUGGERITORE_REALTIME", "off").strip().lower() in ("on", "1", "true", "yes")


def _provider() -> dict:
    name = os.getenv("REALTIME_PROVIDER", "xai").strip().lower()
    return _PROVIDERS.get(name, _PROVIDERS["xai"])


def _load_key(cfg: dict) -> Optional[str]:
    for name in cfg["key_envs"]:
        v = os.getenv(name)
        if v:
            return v
    return None


def _distill_every() -> int:
    try:
        return max(1, int(os.getenv("SUGGERITORE_DISTILL_EVERY", "4")))
    except ValueError:
        return 4


def _base_cap() -> int:
    try:
        return max(2, int(os.getenv("SUGGERITORE_BASE_CAP", "8")))
    except ValueError:
        return 8


def render_ledger(state) -> str:
    """Rende il ledger (SPEC §1) come blocco testo da iniettare nelle istruzioni.

    E' cio' che tiene la memoria sul realtime: identity/objective + fatti + impegni,
    compatti. Vuoto -> stringa vuota (niente rumore prima del primo fatto).
    """
    try:
        facts = getattr(state, "facts", []) or []
        commitments = getattr(state, "commitments", []) or []
        if not facts and not commitments:
            return ""
        lines = ["\n\n--- MEMORIA DELLA CHIAMATA (aggiornata) ---"]
        ident = getattr(state, "identity", "") or ""
        obj = getattr(state, "objective", "") or ""
        if ident:
            lines.append(f"Interlocutore: {ident}")
        if obj:
            lines.append(f"Obiettivo: {obj}")
        if facts:
            lines.append("Fatti noti:")
            lines += [f"- {getattr(f, 'text', f)}" for f in facts]
        if commitments:
            lines.append("Impegni presi:")
            lines += [f"- {getattr(c, 'text', c)}" for c in commitments]
        lines.append("Usa questa memoria; non richiedere cio' che gia' sai.")
        return "\n".join(lines)
    except Exception:
        logger.debug("render_ledger fallito (ignorato)", exc_info=True)
        return ""


async def _connect(url: str, headers: dict):
    """websockets.connect compat: 13.x usa extra_headers, 14/15 additional_headers."""
    import websockets
    try:
        return await websockets.connect(url, additional_headers=headers, max_size=None)
    except TypeError:
        return await websockets.connect(url, extra_headers=headers, max_size=None)


class RealtimeRelay:
    """Ponte fra il WebSocket del browser (``connection``) e il provider realtime."""

    def __init__(self, connection, persona_instructions: str):
        self.conn = connection
        self.persona = persona_instructions or ""
        self.cfg = _provider()
        self.provider_ws = None
        self.meter = RealtimeCostMeter(self.cfg["price_model"])
        self._turn = 0
        self._distilling = False
        self._pending: list[dict] = []
        self._user_tx = ""
        self._assist_tx = ""
        self._ai_speaking = False
        self._seen: set[str] = set()  # tipi evento gia' loggati (diagnostica)
        self._resp_t0 = 0.0           # inizio risposta (per latenza time-to-first-audio)
        self._latency_ms = 0
        self._latency_done = True
        self.mode = "suggeritore"     # suggeritore | base_cap | base_full
        self._items: list[str] = []   # id item conversazione (per il cap del base)
        self._response_id = None      # id risposta in corso (per un barge-in pulito)
        self.projector = None         # proiezione costi base pieno/cappato (creata in connect)
        self._sug_trend: list[float] = []
        self._prev_sug = 0.0

    # ---- setup -----------------------------------------------------------------
    def _session_config(self) -> dict:
        # Il ledger si inietta SOLO in modalita' suggeritore. In base (cap/full) l'esaminatore
        # ha solo la sua persona + il contesto che il provider tiene (che nel base_cap tronchiamo).
        ledger = render_ledger(state_store.current()) if self.mode == "suggeritore" else ""
        instructions = self.persona + ledger
        # Shape GA (verificata dal probe). REALTIME-NATIVE: server_vad -> il modello
        # rileva da solo quando lo studente ha finito di parlare e risponde, senza
        # commit manuale. Trascrizione input attiva per alimentare il ledger. Audio
        # PCM16 24kHz per combaciare col frontend (WavRecorder/WavStreamPlayer).
        return {
            "type": "session.update",
            "session": {
                "type": "realtime",
                "model": self.cfg["model"],
                "instructions": instructions,
                "output_modalities": ["audio"],
                "audio": {
                    "input": {
                        "format": {"type": "audio/pcm", "rate": 24000},
                        # VAD meno sensibile all'ECO: soglia piu' alta e piu' silenzio
                        # richiesto prima di chiudere il turno -> l'AI non si auto-interrompe
                        # sentendosi dalle casse (utile anche senza cuffie).
                        "turn_detection": {
                            "type": "server_vad",
                            "threshold": 0.6,
                            "prefix_padding_ms": 300,
                            "silence_duration_ms": 700,
                        },
                        "transcription": {"model": "whisper-1", "language": "it"},
                    },
                    "output": {
                        "format": {"type": "audio/pcm", "rate": 24000},
                        "voice": self.cfg["voice"],
                    },
                },
            },
        }

    async def connect(self) -> bool:
        key = _load_key(self.cfg)
        if not key:
            envs = " o ".join(self.cfg["key_envs"])
            logger.error("[REALTIME] chiave mancante (%s) per provider realtime", envs)
            await self._send_error(f"Modalita' realtime attiva ma manca la chiave ({envs}). Impostala e riavvia.")
            return False
        try:
            self.provider_ws = await _connect(self.cfg["url"], {"Authorization": f"Bearer {key}"})
            await self.provider_ws.send(json.dumps(self._session_config()))
        except Exception as e:
            logger.exception("[REALTIME] connessione al provider fallita")
            await self._send_error(f"Connessione al modello realtime fallita: {e}")
            return False
        logger.info("[REALTIME] sessione aperta (provider=%s model=%s)",
                    os.getenv("REALTIME_PROVIDER", "xai"), self.cfg["model"])
        # Proiettore costi base: persona SENZA ledger come token instr (stima /4).
        self.projector = CostProjector(self.cfg["price_model"], max(1, len(self.persona) // 4))
        return True

    async def _send_error(self, message: str) -> None:
        try:
            await self.conn.websocket.send_text(json.dumps({"type": "error", "message": message}))
        except Exception:
            pass

    def set_mode(self, mode: Optional[str]) -> None:
        """Modalita' del test A/B: suggeritore | base_cap | base_full."""
        if mode in ("suggeritore", "base_cap", "base_full"):
            self.mode = mode
        logger.info("[REALTIME] modalita': %s", self.mode)

    async def _truncate_context(self) -> None:
        """BASE CAPPATO: tiene solo gli ultimi N item -> il modello 'dimentica' i fatti
        iniziali (come il base delle evidence originali). Cancella i piu' vecchi."""
        cap = _base_cap()
        while len(self._items) > cap and self.provider_ws:
            old = self._items.pop(0)
            try:
                await self.provider_ws.send(json.dumps({
                    "type": "conversation.item.delete", "item_id": old}))
            except Exception:
                break

    async def greet(self) -> None:
        """Fa parlare per primo l'agente (saluto + prima domanda) — esperienza
        agentica: quando lo studente 'entra', l'esaminatore lo accoglie subito."""
        if self.provider_ws:
            try:
                await self.provider_ws.send(json.dumps({"type": "response.create"}))
                self._ai_speaking = True
            except Exception:
                logger.debug("[REALTIME] greet fallito", exc_info=True)

    # ---- browser -> provider ---------------------------------------------------
    async def feed_append(self, delta_b64: str) -> None:
        # il browser manda il campo `delta`; il Realtime API vuole `audio`. Ignora i
        # chunk vuoti (il provider li rifiuta con "empty bytes"). HALF-DUPLEX ANTI-ECO:
        # mentre l'esaminatore parla NON inoltriamo il microfono, cosi' l'eco delle
        # casse non fa scattare il VAD e non annulla la risposta a meta' (freeze).
        if self.provider_ws and delta_b64 and not self._ai_speaking:
            await self.provider_ws.send(json.dumps({
                "type": "input_audio_buffer.append", "audio": delta_b64}))

    async def feed_commit(self) -> None:
        # In modalita' realtime-native il turno lo chiude il server_vad, non il
        # browser: il commit dal client (se arriva) e' un no-op. Teniamo il metodo
        # per compatibilita' col vecchio frontend push-to-talk.
        return

    # ---- provider -> browser ---------------------------------------------------
    async def pump_provider(self) -> None:
        """Legge gli eventi del provider e li inoltra al browser. Loop di background."""
        try:
            while self.provider_ws is not None:
                raw = await self.provider_ws.recv()
                ev = json.loads(raw)
                t = ev.get("type", "")

                if t in ("response.created", "response.output_audio.started"):
                    self._ai_speaking = True
                    self._resp_t0 = time.monotonic()   # avvio cronometro latenza
                    self._latency_done = False
                    if t == "response.created":
                        self._response_id = (ev.get("response") or {}).get("id")
                        # anti-eco: svuota il buffer input all'inizio della risposta,
                        # cosi' l'eco gia' catturato non viene interpretato come voce.
                        if self.provider_ws:
                            try:
                                await self.provider_ws.send(json.dumps({
                                    "type": "input_audio_buffer.clear"}))
                            except Exception:
                                pass

                elif t in ("response.audio.delta", "response.output_audio.delta"):
                    # GA usa `response.output_audio.delta`, beta `response.audio.delta`.
                    # Inoltro col nome che il frontend riproduce gia' (response.audio.delta).
                    self._ai_speaking = True
                    if not self._latency_done and self._resp_t0:
                        # latenza = tempo dal via-risposta al primo byte audio (TTFB)
                        self._latency_ms = int((time.monotonic() - self._resp_t0) * 1000)
                        self._latency_done = True
                    await self.conn.websocket.send_text(json.dumps({
                        "type": "response.audio.delta", "delta": ev.get("delta", "")}))

                elif t in ("response.audio_transcript.delta", "response.output_audio_transcript.delta"):
                    self._assist_tx += ev.get("delta", "")
                    # sottotitolo LIVE dell'esaminatore (testo accumulato finora)
                    await self.conn.websocket.send_text(json.dumps({
                        "type": "transcript", "role": "assistant", "text": self._assist_tx}))

                elif t == "input_audio_buffer.speech_started":
                    # Niente barge-in: col half-duplex il mic e' muto mentre l'esaminatore
                    # parla, quindi lo studente non lo interrompe. Inviare 'interrupted' qui
                    # taglierebbe la riproduzione della risposta appena iniziata (era il bug
                    # del "secondo turno muto"). Lo studente parla al proprio turno; basta.
                    pass

                elif t in ("conversation.item.created", "conversation.item.added"):
                    # traccia gli id item per poter cappare il contesto in base_cap.
                    iid = (ev.get("item") or {}).get("id")
                    if iid:
                        self._items.append(iid)

                elif t == "conversation.item.input_audio_transcription.delta":
                    # alcune versioni GA streammano la trascrizione utente a delta.
                    self._user_tx += ev.get("delta", "")
                    await self.conn.websocket.send_text(json.dumps({
                        "type": "transcript", "role": "user", "text": self._user_tx}))

                elif t == "conversation.item.input_audio_transcription.completed":
                    tx = (ev.get("transcript") or "").strip()
                    if tx:
                        self._user_tx = tx  # la versione finale ha la precedenza
                        await self.conn.websocket.send_text(json.dumps({
                            "type": "transcript", "role": "user", "text": tx}))

                elif t in ("response.output_audio.done", "response.audio.done", "response.cancelled"):
                    # l'audio dell'esaminatore e' finito (o annullato): riapri subito il
                    # microfono, cosi' non resta mai muto per sbaglio (no freeze).
                    self._ai_speaking = False

                elif t == "response.done":
                    self._ai_speaking = False
                    self._response_id = None
                    await self._on_response_done(ev)

                elif t == "error":
                    err = ev.get("error") or {}
                    msg = (err.get("message") or "")
                    logger.error("[REALTIME] errore provider: %s", err)
                    # Errori BENIGNI del barge-in (cancel quando non c'e' una risposta
                    # attiva) o di buffer vuoto: normali, non li mostriamo all'utente.
                    low = msg.lower()
                    benign = (
                        "no active response" in low
                        or "cancellation failed" in low
                        or "buffer" in low and "empty" in low
                    )
                    if not benign:
                        await self._send_error(msg or "Errore dal modello realtime")

                elif t and t not in self._seen and (
                    t.startswith("conversation.")
                    or t.startswith("response.")
                    or t.startswith("input_audio")
                ):
                    # Diagnostica: logga UNA volta ogni tipo evento non gestito. Cosi'
                    # "guarda i log" rivela subito eventuali nomi GA diversi dai previsti
                    # (es. per la trascrizione input che alimenta il pannello memoria).
                    self._seen.add(t)
                    logger.info("[REALTIME] evento non gestito: %s", t)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[REALTIME] pump_provider terminato")

    async def _on_response_done(self, ev: dict) -> None:
        # costo reale di questa risposta
        try:
            self.meter.record((ev.get("response") or {}).get("usage"))
        except Exception:
            logger.debug("[REALTIME] cost record fallito", exc_info=True)

        # segnala fine audio al browser
        try:
            await self.conn.send_audio_done()
        except Exception:
            pass

        # accumula i transcript come turni del contratto, poi distilla ogni N
        self._turn += 1
        user_tx, assist_tx = self._user_tx.strip(), self._assist_tx.strip()
        self._user_tx = self._assist_tx = ""

        # Confronto costi LIVE: suggeritore REALE + proiezione base pieno/cappato sui token del turno.
        proj: dict = {}
        try:
            b = parse_usage((ev.get("response") or {}).get("usage") or {})
            # audio "fresco" dello studente questo turno = input audio meno la parte
            # cachata (che e' contesto trattenuto, non voce nuova).
            u_fresh = max(0, b.get("audio_in", 0) - b.get("cached_audio", 0))
            if self.projector is not None:
                proj = self.projector.add_turn(u_fresh, b.get("out_audio", 0))
            sug_total = round(self.meter.total_usd, 6)
            sug_turn = round(sug_total - self._prev_sug, 6)
            self._prev_sug = sug_total
            self._sug_trend.append(sug_turn)
            proj.update({
                "sug_usd": sug_total,
                "sug_turn": sug_turn,
                "trend_sug": self._sug_trend[-20:],
                "trend_full": self.projector.trend_full[-20:] if self.projector else [],
                "trend_cap": self.projector.trend_cap[-20:] if self.projector else [],
            })
        except Exception:
            logger.debug("[REALTIME] proiezione costi fallita", exc_info=True)

        # HUD live: metriche cumulate + confronto costi + ultima battuta dell'esaminatore.
        try:
            await self.conn.websocket.send_text(json.dumps({
                "type": "metrics", "turn": self._turn,
                "question": assist_tx, "user_said": user_tx,
                "latency_ms": self._latency_ms,
                **self.meter.snapshot(),
                **proj,
            }))
        except Exception:
            logger.debug("[REALTIME] metrics send fallito", exc_info=True)
        if self.mode == "suggeritore":
            # memory layer ON: accumula i turni e distilla nel ledger ogni N.
            if user_tx:
                self._pending.append({"turn": f"t{self._turn}a", "role": "caller", "text": user_tx})
            if assist_tx:
                self._pending.append({"turn": f"t{self._turn}b", "role": "agent", "text": assist_tx})
            if self._turn % _distill_every() == 0:
                self._schedule_distill()
        elif self.mode == "base_cap":
            # base cappato: tronca il contesto -> l'esaminatore dimentica i fatti iniziali.
            await self._truncate_context()

    # ---- distill + re-grounding ------------------------------------------------
    def _schedule_distill(self) -> None:
        if self._distilling or not self._pending:
            return
        batch, self._pending = self._pending, []
        self._distilling = True
        asyncio.create_task(self._run_distill(batch))

    async def _run_distill(self, batch: list[dict]) -> None:
        try:
            updated = await distiller.distill(state_store.current(), batch)
            state_store.save(updated)
            await self.conn.send_state(updated)  # pannello live
            # re-grounding §3 sul realtime: aggiorna le istruzioni con il ledger nuovo.
            if self.provider_ws:
                await self.provider_ws.send(json.dumps(self._session_config()))
                # SESSION-ROTATION: dopo aver ri-iniettato il ledger, tronca il contesto
                # del provider -> il Suggeritore tiene un contesto PIATTO (la memoria vive
                # nel ledger). E' il vero meccanismo di risparmio del memory layer.
                await self._truncate_context()
        except Exception:
            logger.exception("[REALTIME] distillazione fallita")
        finally:
            self._distilling = False

    async def close(self) -> None:
        try:
            self.meter.log_summary()
        except Exception:
            pass
        if self.provider_ws:
            try:
                await self.provider_ws.close()
            except Exception:
                pass
            self.provider_ws = None
