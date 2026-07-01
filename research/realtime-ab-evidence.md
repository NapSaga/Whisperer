# Evidenza A/B realtime — Suggeritore vs Base (lezione VERA 25 min)

**Cosa dimostra:** su una lezione orale realtime lunga, il memory layer (Suggeritore
con session-rotation) costa **~62% meno** del "ricorda tutto" (Base pieno) E mantiene la
memoria piena — mentre l'unica alternativa economica (Base cappato) **dimentica**.

## Risultato misurato (sessione reale, StudierAI oral-exam persona)

- **57 risposte · 25.3 minuti · gpt-realtime-mini · italiano** (customer-zero StudierAI).
- Audio a ogni turno, `conversation.item.delete` (rotation) attiva, pannello memoria pieno.

| | Costo | vs Suggeritore | Memoria |
|---|---|---|---|
| **Suggeritore** (REALE, misurato) | **$0.6466** | — | ✅ ricorda tutto (ledger) |
| **Base pieno** (proiezione) | **$1.0461** | **+62%** | ✅ ricorda ma caro (contesto cresce) |
| **Base cappato** (proiezione) | **$0.6797** | +5% | ❌ dimentica (contesto troncato) |

Cache-hit reale del Suggeritore: 61.3% (audio 24.7% · testo 81.1%). Input 145.638 tok,
output 15.293 tok. Costo reale ~2.55 c/min.

## Perché funziona (il meccanismo)
- **Base pieno**: il provider ri-legge TUTTA la conversazione ogni turno → il contesto
  cresce con la durata; anche col prompt caching, a 25 min il conto sale (+62%).
- **Suggeritore (session-rotation)**: dopo ogni distill tronca il contesto del provider e
  ri-semina il ledger nelle istruzioni → contesto ~piatto, memoria nel ledger. Costo vicino
  al Base cappato **ma senza dimenticare**.
- **Forma che cresce con la durata**: a 15 min il divario è modesto (il caching appiattisce),
  a 25 min è netto (+62%). Più lunga la lezione, più vince il Suggeritore.

## Metodo (onestà)
- Il **Suggeritore è misurato** (costo reale dal `RealtimeCostMeter`, prezzi gpt-realtime-mini).
- **Base pieno/cappato sono PROIEZIONI** calcolate sui token REALI della stessa sessione
  (`server/server/app/cost_projection.py`): per turno, audio fresco dello studente + audio
  dell'esaminatore, contesto accumulato con prompt caching sul prefisso ≥1024 tok. Non è un
  preventivo esatto: dà la forma e il ordine di grandezza dai token veri, non inventati.
- Per un numero blindato al 100%: rigirare la stessa lezione anche in Base pieno (toggle
  backend `mode=base_full`).

## Dove sta l'implementazione (repo suggeritore)
- Relay realtime + rotation + confronto: `server/server/app/realtime_relay.py`.
- Proiezione costi: `server/server/app/cost_projection.py`.
- Cost meter GA: `sdk/whisperer/realtime_cost_meter.py`.
- UI confronto live: `server/frontend/src/components/CostCompare.tsx` (+ VoiceOrb, sottotitoli, recap).
- Persona: prompt esaminatore StudierAI **verbatim** in `server/server/app/agent_config.py`.
- Contesto costo esteso: `research/realtime-voice-cost.md`.

## Nota provider
Su **Grok Voice** ($0.05/min flat, time-based) il memory layer non risparmierebbe nulla
(paghi a tempo). Il risparmio del Suggeritore vale sui provider **a token** (OpenAI Realtime).
