"""Realtime cost meter — costo REALE per risposta del Realtime API GA (audio-native).

Affianca ``cost_meter.py`` (che e' la lente audio sul path VoicePipeline testo). Qui
prezziamo i token VERI del Realtime API GA — audio e testo, con la quota servita da
cache (``cached_tokens``) scontata — leggendo l'``usage`` dell'evento ``response.done``.

Perche' serve: nel Realtime l'intera conversazione viene rifatturata a ogni risposta,
ma il prompt caching e' automatico e abbatte il prefisso ripetuto. Il numero che conta
per decidere se il memory layer (session-rotation, SPEC §3) fa davvero risparmiare e' la
**cache-hit %** sul contesto accumulato. Questo meter la misura dai dati reali di OpenAI.

Sicurezza: ogni metodo e' avvolto in try/except e non solleva MAI — e' osservabilita',
non deve poter rompere un relay vocale. Disattivabile con ``REALTIME_COST_LOG=false``.

Pricing: USD per 1M token, gpt-realtime-mini (as-of 2026-07). Aggiornare qui al cambio
listino. Fonti: developers.openai.com/api/docs/pricing, eesel.ai/blog/gpt-realtime-mini-pricing
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# USD / 1M token. *_cached_in e' il prezzo scontato del prefisso servito da cache.
REALTIME_PRICING: Dict[str, Dict[str, float]] = {
    "gpt-realtime-mini": {
        "audio_in": 10.0, "audio_cached_in": 0.30, "audio_out": 20.0,
        "text_in": 0.60, "text_cached_in": 0.06, "text_out": 2.40,
    },
    "gpt-realtime-2": {
        "audio_in": 32.0, "audio_cached_in": 0.40, "audio_out": 64.0,
        "text_in": 4.0, "text_cached_in": 0.40, "text_out": 24.0,
    },
}

_DEFAULT_MODEL = "gpt-realtime-mini"


def _enabled() -> bool:
    return os.getenv("REALTIME_COST_LOG", "true").strip().lower() in ("1", "true", "yes", "on")


def _i(x: Any) -> int:
    try:
        return int(x or 0)
    except (TypeError, ValueError):
        return 0


def parse_usage(usage: Dict[str, Any]) -> Dict[str, int]:
    """Estrae il breakdown token dall'``usage`` di ``response.done``, in modo difensivo.

    Shape (Realtime GA):
        usage.input_token_details.{text_tokens, audio_tokens, cached_tokens,
                                   cached_tokens_details.{text_tokens, audio_tokens}}
        usage.output_token_details.{text_tokens, audio_tokens}
    Alcune versioni omettono il dettaglio: si ricade sui totali e si attribuisce
    all'audio (dominante nella voce), cosi' il costo resta una stima sensata, non 0.
    """
    in_det = usage.get("input_token_details") or {}
    out_det = usage.get("output_token_details") or {}
    cached_det = in_det.get("cached_tokens_details") or {}

    input_tokens = _i(usage.get("input_tokens"))
    output_tokens = _i(usage.get("output_tokens"))

    audio_in = _i(in_det.get("audio_tokens"))
    text_in = _i(in_det.get("text_tokens"))
    cached_total = _i(in_det.get("cached_tokens"))
    cached_audio = _i(cached_det.get("audio_tokens"))
    cached_text = _i(cached_det.get("text_tokens"))
    out_audio = _i(out_det.get("audio_tokens"))
    out_text = _i(out_det.get("text_tokens"))

    detailed = bool(in_det) and (audio_in or text_in)

    if audio_in == 0 and text_in == 0 and input_tokens > 0:
        audio_in = input_tokens
    if cached_total > 0 and (cached_audio + cached_text) == 0:
        tot = audio_in + text_in
        if tot > 0:
            cached_audio = round(cached_total * audio_in / tot)
            cached_text = cached_total - cached_audio
        else:
            cached_audio = cached_total
    if out_audio == 0 and out_text == 0 and output_tokens > 0:
        out_audio = output_tokens

    return {
        "input_tokens": input_tokens, "output_tokens": output_tokens,
        "audio_in": audio_in, "text_in": text_in,
        "cached_total": cached_total, "cached_audio": cached_audio, "cached_text": cached_text,
        "out_audio": out_audio, "out_text": out_text,
        "detailed": 1 if detailed else 0,
    }


def cost_for(model: str, b: Dict[str, int]) -> float:
    """Costo USD della singola risposta dal breakdown token."""
    p = REALTIME_PRICING.get(model) or REALTIME_PRICING[_DEFAULT_MODEL]
    fresh_audio = max(0, b["audio_in"] - b["cached_audio"])
    fresh_text = max(0, b["text_in"] - b["cached_text"])
    return (
        fresh_audio * p["audio_in"]
        + b["cached_audio"] * p["audio_cached_in"]
        + fresh_text * p["text_in"]
        + b["cached_text"] * p["text_cached_in"]
        + b["out_audio"] * p["audio_out"]
        + b["out_text"] * p["text_out"]
    ) / 1_000_000.0


class RealtimeCostMeter:
    """Accumula il costo reale di una sessione vocale e lo logga.

    Uso:
        m = RealtimeCostMeter("gpt-realtime-mini")
        m.record(usage)        # a ogni response.done
        m.log_summary()        # a fine sessione
    """

    def __init__(self, model: str = _DEFAULT_MODEL, jsonl_path: Optional[str] = None):
        self.enabled = _enabled()
        self.model = model if model in REALTIME_PRICING else _DEFAULT_MODEL
        self.t0 = time.time()
        self.n = 0
        self.total_usd = 0.0
        self.sum: Dict[str, int] = {
            "input_tokens": 0, "output_tokens": 0, "audio_in": 0, "text_in": 0,
            "cached_total": 0, "cached_audio": 0, "cached_text": 0,
            "out_audio": 0, "out_text": 0,
        }
        self.jsonl_path = jsonl_path or os.getenv("REALTIME_COST_PATH") or None
        if self.enabled:
            logger.info("[REALTIME-COST] meter attivo (model=%s)", self.model)

    def snapshot(self) -> Dict[str, Any]:
        """Metriche cumulate della sessione (per la HUD live: costo, cache-hit)."""
        s = self.sum
        hit = (s["cached_total"] / s["input_tokens"] * 100) if s["input_tokens"] else 0.0
        return {
            "responses": self.n,
            "total_usd": round(self.total_usd, 4),
            "cache_hit_pct": round(hit, 1),
            "input_tokens": s["input_tokens"],
            "output_tokens": s["output_tokens"],
        }

    def record(self, usage: Optional[Dict[str, Any]]) -> None:
        if not self.enabled or not usage:
            return
        try:
            b = parse_usage(usage)
            usd = cost_for(self.model, b)
            self.n += 1
            self.total_usd += usd
            for k in self.sum:
                self.sum[k] += b.get(k, 0)
            hit = (b["cached_total"] / b["input_tokens"] * 100) if b["input_tokens"] else 0.0
            logger.info(
                "[REALTIME-COST] r%d $%.5f | in %d (audio %d txt %d, cached %d=%.0f%%) "
                "out %d (audio %d txt %d)%s | cum $%.4f",
                self.n, usd, b["input_tokens"], b["audio_in"], b["text_in"],
                b["cached_total"], hit, b["output_tokens"], b["out_audio"], b["out_text"],
                "" if b["detailed"] else " [no-breakdown:stima]", self.total_usd,
            )
            if self.jsonl_path:
                self._append_jsonl({"r": self.n, "usd": round(usd, 6),
                                    "cache_hit_pct": round(hit, 1), **b})
        except Exception:
            logger.debug("[REALTIME-COST] record fallito (ignorato)", exc_info=True)

    def log_summary(self) -> None:
        if not self.enabled or self.n == 0:
            return
        try:
            mins = (time.time() - self.t0) / 60.0
            s = self.sum
            hit = (s["cached_total"] / s["input_tokens"] * 100) if s["input_tokens"] else 0.0
            a_hit = (s["cached_audio"] / s["audio_in"] * 100) if s["audio_in"] else 0.0
            t_hit = (s["cached_text"] / s["text_in"] * 100) if s["text_in"] else 0.0
            if mins >= 0.3:
                rate_str = "%.3f c/min | proiez. 15min: $%.4f" % (
                    self.total_usd / mins * 100, self.total_usd / mins * 15)
            else:
                rate_str = "durata troppo breve per proiezione $/min"
            logger.info(
                "[REALTIME-COST] ===== SESSION SUMMARY =====\n"
                "  modello: %s | risposte: %d | durata: %.1f min\n"
                "  COSTO TOTALE: $%.4f  (%s)\n"
                "  input: %d tok | CACHE-HIT %.1f%%  (audio %.1f%% · testo %.1f%%)\n"
                "  output: %d tok (audio %d / testo %d)\n"
                "  >>> cache-hit ALTA (>80%%) = base gia' economico, memory layer solo per cross-sessione/latenza\n"
                "  >>> cache-hit BASSA = caching non regge, il memory layer (ledger) recupererebbe molto",
                self.model, self.n, mins, self.total_usd, rate_str,
                s["input_tokens"], hit, a_hit, t_hit,
                s["output_tokens"], s["out_audio"], s["out_text"],
            )
            if self.jsonl_path:
                self._append_jsonl({"summary": True, "model": self.model,
                                    "responses": self.n, "minutes": round(mins, 2),
                                    "total_usd": round(self.total_usd, 6),
                                    "cache_hit_pct": round(hit, 1),
                                    "audio_hit_pct": round(a_hit, 1),
                                    "text_hit_pct": round(t_hit, 1)})
        except Exception:
            logger.debug("[REALTIME-COST] summary fallito (ignorato)", exc_info=True)

    def _append_jsonl(self, obj: Dict[str, Any]) -> None:
        try:
            with open(self.jsonl_path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(obj, ensure_ascii=False) + "\n")
        except Exception:
            logger.debug("[REALTIME-COST] jsonl append fallito (ignorato)", exc_info=True)
