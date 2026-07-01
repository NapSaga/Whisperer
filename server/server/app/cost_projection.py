"""Proiezione costi Base pieno / Base cappato — per il confronto LIVE vs Suggeritore.

Mentre il Suggeritore gira per davvero (costo REALE dal RealtimeCostMeter), stimiamo
sugli STESSI turni cosa costerebbe:
- BASE PIENO: il provider ri-legge TUTTA la conversazione ogni turno (contesto cresce).
- BASE CAPPATO: solo gli ultimi ~N token di contesto (piatto, ma dimentica).

E' una STIMA: usa i token audio del turno reale, i prezzi ``gpt-realtime-mini`` e il
prompt caching sul prefisso >= 1024 token. Serve a dare la FORMA del confronto ("base
sale, suggeritore piatto"), non un preventivo esatto.
"""

from __future__ import annotations

from typing import Dict, List

from whisperer.realtime_cost_meter import REALTIME_PRICING  # stesso pricing del meter reale

CACHE_MIN = 1024  # soglia minima prefisso cacheable (OpenAI)


class CostProjector:
    """Accumula per-turno e proietta il costo cumulato di Base pieno / Base cappato."""

    def __init__(self, model: str, instr_tokens: int, cap_tokens: int = 1500):
        self.p = REALTIME_PRICING.get(model) or REALTIME_PRICING["gpt-realtime-mini"]
        self.instr = max(0, int(instr_tokens))
        self.cap = max(256, int(cap_tokens))
        self.acc = 0  # audio accumulato dei turni PRECEDENTI
        self.n = 0
        self.base_full_usd = 0.0
        self.base_cap_usd = 0.0
        self.trend_full: List[float] = []  # $/turno base pieno
        self.trend_cap: List[float] = []

    def _turn_cost(self, context_audio: int, u_audio: int, a_audio: int, first: bool) -> float:
        p = self.p
        # prefisso = instr (testo) + context_audio (audio prior). Cacheato se >= soglia
        # e non al primo turno (prima nessuna cache).
        prefix = self.instr + context_audio
        if prefix >= CACHE_MIN and not first:
            instr_cost = self.instr / 1e6 * p["text_cached_in"]
            ctx_cost = context_audio / 1e6 * p["audio_cached_in"]
        else:
            instr_cost = self.instr / 1e6 * p["text_in"]
            ctx_cost = context_audio / 1e6 * p["audio_in"]
        fresh = u_audio / 1e6 * p["audio_in"]      # audio nuovo dello studente
        out = a_audio / 1e6 * p["audio_out"]       # audio dell'esaminatore
        return instr_cost + ctx_cost + fresh + out

    def add_turn(self, u_audio: int, a_audio: int) -> Dict[str, float]:
        first = self.n == 0
        u_audio = max(0, int(u_audio or 0))
        a_audio = max(0, int(a_audio or 0))
        cf = self._turn_cost(self.acc, u_audio, a_audio, first)           # base pieno
        cc = self._turn_cost(min(self.acc, self.cap), u_audio, a_audio, first)  # base cappato
        self.base_full_usd += cf
        self.base_cap_usd += cc
        self.trend_full.append(round(cf, 6))
        self.trend_cap.append(round(cc, 6))
        self.acc += u_audio + a_audio
        self.n += 1
        return {
            "base_full_usd": round(self.base_full_usd, 6),
            "base_cap_usd": round(self.base_cap_usd, 6),
            "base_full_turn": round(cf, 6),
            "base_cap_turn": round(cc, 6),
        }
