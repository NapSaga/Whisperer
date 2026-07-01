"""Misura AUTOMATICA della cache-hit + costo reale del Realtime API GA (no microfono).

Apre una sessione ``gpt-realtime-mini`` reale (shape GA), guida ~N turni via testo e
legge l'``usage`` VERO di ogni ``response.done`` — inclusi i ``cached_tokens`` di OpenAI —
riusando ``whisperer.realtime_cost_meter``. Stampa la cache-hit misurata e il costo.

Perche' testo e non audio: la CACHE-HIT sul contesto accumulato (il numero che decide se
il memory layer fa risparmiare sul Realtime) dipende dal prefisso stabile, meccanismo
identico audio/testo. Il testo lo esercita fedelmente, costa pochi centesimi, niente mic.
I token audio cambiano le grandezze ASSOLUTE (il floor I/O), non il RAPPORTO di cache-hit.

Uso (dal root del repo):
    python harness/measure_realtime_cost.py            # 25 turni
    python harness/measure_realtime_cost.py 40         # 40 turni
    REALTIME_COST_PATH=/tmp/probe.jsonl python harness/measure_realtime_cost.py

Richiede: OPENAI_API_KEY (ambiente o .env del repo) e il pacchetto ``websockets``.
"""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

# Importa il meter come modulo STANDALONE (e' puro stdlib): puntiamo direttamente
# alla sua cartella per NON eseguire whisperer/__init__.py, che tira dentro deps
# pesanti e sintassi py>=3.10. Cosi' il probe gira con qualsiasi python.
_REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO / "sdk" / "whisperer"))
from realtime_cost_meter import RealtimeCostMeter  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
logger = logging.getLogger("probe")

# Provider selezionabile via env REALTIME_PROVIDER. Default 'xai' (Grok Voice):
# compatibile con la spec OpenAI Realtime (basta cambiare base URL), e utilizzabile
# ora che le chiavi OpenAI sono fuori quota. 'openai' resta disponibile.
PROVIDER = os.getenv("REALTIME_PROVIDER", "xai").strip().lower()
PROVIDERS = {
    "xai": {
        "ws": "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
        "model": "grok-voice-latest",
        "key_envs": ("XAI_API_KEY", "GROK_API_KEY"),
        "price_model": "gpt-realtime-mini",  # proxy $ token-based (vedi nota)
        "note": ("Grok Voice: pricing terze-parti ~$3/ORA FLAT (time-based). Se confermato, "
                 "il memory layer NON riduce il costo qui — paghi a tempo, non a token. "
                 "Il $ token-based sotto e' solo un proxy; guarda tokens + cache-hit."),
    },
    "openai": {
        "ws": "wss://api.openai.com/v1/realtime?model=gpt-realtime-mini",
        "model": "gpt-realtime-mini",
        "key_envs": ("OPENAI_API_KEY",),
        "price_model": "gpt-realtime-mini",
        "note": "OpenAI Realtime token-based; caching automatico sul prefisso stabile.",
    },
}
if PROVIDER not in PROVIDERS:
    raise SystemExit(f"REALTIME_PROVIDER sconosciuto: {PROVIDER} (usa: xai | openai)")
CFG = PROVIDERS[PROVIDER]
WS_URL = CFG["ws"]
MODEL = CFG["model"]


def _load_api_key() -> str:
    for name in CFG["key_envs"]:
        v = os.getenv(name)
        if v:
            return v
    for parent in [_REPO, *_REPO.parents]:
        for fname in (".env", ".env.local"):
            f = parent / fname
            if f.exists():
                for line in f.read_text(encoding="utf-8", errors="ignore").splitlines():
                    line = line.strip()
                    for name in CFG["key_envs"]:
                        if line.startswith(name + "="):
                            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"Chiave non trovata per provider={PROVIDER} (cerco: {', '.join(CFG['key_envs'])}).")


def _build_instructions() -> str:
    """Prefisso stabile rappresentativo: prompt-esaminatore + documento ~8000 char."""
    qa = []
    for i in range(1, 41):
        qa.append(
            f"Q: Domanda {i} sull'argomento di studio — spiega il concetto chiave {i} "
            f"e le sue implicazioni principali.\n"
            f"A: Risposta modello {i}: il concetto {i} riguarda gli aspetti fondamentali "
            f"della materia, con riferimento ai principi teorici e alle applicazioni "
            f"pratiche discusse nel materiale del corso."
        )
    document = "\n\n".join(qa)[:8000]
    return (
        "Sei un professore universitario italiano esigente ma giusto che conduce un "
        "esame orale. Fai UNA domanda alla volta basata SOLO sul materiale sotto. "
        "Valuta in modo rigoroso ma equo, sii diretto sugli errori.\n\n"
        "MATERIALE DI STUDIO (Domande e Risposte):\n" + document
    )


async def _connect(url: str, headers: dict):
    """websockets.connect compat: 13.x usa extra_headers, 14/15 additional_headers."""
    import websockets
    try:
        return await websockets.connect(url, additional_headers=headers, max_size=None)
    except TypeError:
        return await websockets.connect(url, extra_headers=headers, max_size=None)


async def run(n_turns: int) -> None:
    try:
        import websockets  # noqa: F401
    except ImportError:
        raise SystemExit("manca il pacchetto 'websockets' (pip install websockets).")

    import websockets.exceptions as wse

    api_key = _load_api_key()
    headers = {"Authorization": f"Bearer {api_key}"}  # spec Realtime: solo Bearer
    meter = RealtimeCostMeter(CFG["price_model"])

    logger.info("[PROBE] provider=%s  model=%s", PROVIDER, MODEL)
    logger.info("[PROBE] NOTA: %s", CFG["note"])
    logger.info("[PROBE] connessione a %s ...", WS_URL)
    ws = await _connect(WS_URL, headers)
    try:
        # 1) Sessione GA: solo testo in output (l'audio non incide sulla cache-hit
        #    dell'input e risparmia soldi); instructions = prefisso stabile reale.
        await ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "type": "realtime",
                "model": MODEL,
                "output_modalities": ["text"],
                "instructions": _build_instructions(),
            },
        }))

        async def wait_for(types, timeout=60.0):
            while True:
                ev = json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))
                if ev.get("type") == "error":
                    logger.error("[PROBE] errore OpenAI: %s", ev.get("error"))
                    raise SystemExit(1)
                if ev.get("type") in types:
                    return ev

        await wait_for({"session.updated"})
        logger.info("[PROBE] sessione configurata, guido %d turni...\n", n_turns)

        # 2) Guida N turni: messaggio utente -> response.create -> leggi usage.
        for t in range(1, n_turns + 1):
            await ws.send(json.dumps({
                "type": "conversation.item.create",
                "item": {
                    "type": "message", "role": "user",
                    "content": [{"type": "input_text",
                                 "text": f"Risposta dello studente al turno {t}: il "
                                         f"concetto richiesto si riferisce ai principi "
                                         f"fondamentali della materia."}],
                },
            }))
            await ws.send(json.dumps({
                "type": "response.create",
                "response": {"output_modalities": ["text"]},
            }))
            done = await wait_for({"response.done"})
            meter.record((done.get("response") or {}).get("usage"))

    except wse.ConnectionClosed as e:
        reason = (getattr(e, "reason", "") or str(e)).lower()
        if "quota" in reason:
            logger.error(
                "\n[PROBE] OpenAI ha chiuso la connessione: insufficient_quota — la chiave "
                "non ha credito/billing.\n  Riprova con una chiave con quota:\n"
                "  OPENAI_API_KEY=sk-... server/server/.venv/bin/python harness/measure_realtime_cost.py %d",
                n_turns)
        else:
            logger.error("\n[PROBE] OpenAI ha chiuso la connessione: %s", getattr(e, "reason", "") or e)
        return
    finally:
        try:
            await ws.close()
        except Exception:
            pass

    meter.log_summary()


if __name__ == "__main__":
    turns = int(sys.argv[1]) if len(sys.argv) > 1 else 25
    asyncio.run(run(turns))
