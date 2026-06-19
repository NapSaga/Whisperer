# Whisperer — Roadmap post-HackRome

_Branch owner: Gabriele Loreti · aggiornato: 2026-06-19_

---

## Stato attuale

Il core è completo e misurato:

| Componente | Stato | File |
|---|---|---|
| Distiller (SPEC §2) | ✓ | `server/server/app/distiller.py` |
| Injector + compact_input (SPEC §3) | ✓ | `server/server/app/injector.py` |
| State store / ledger (SPEC §1) | ✓ | `server/server/app/state_store.py` |
| Cost meter (SPEC §5) | ✓ | `server/server/app/cost_meter.py` |
| Judge binario (SPEC §6) | ✓ | `harness/judge.py` |
| Batch runner N=10 (SPEC §6) | ✓ | `server/server/batch_run.py`, `harness/runner.py` |
| Web dashboard | ✓ Vercel live | `web/` |
| Watchdog drift detection (SPEC §4) | ✗ progettato, non implementato | — |
| Generalizzazione scenari | ✗ solo scenario "nonna" | `batch_run.py` hardcoded |
| Misurazione chiamate lunghe | ✗ serve validare 7.6× proiettato | — |
| Trascrizione vocale live (Whisper) | ✗ non implementato | — |
| Integrazione StudierAI | ✗ customer zero nominale | — |

**Il numero misurato:** 0/10 → 10/10 recall · costo 1.3× misurato su 28 turn (7.6× proiettato su 10-20 min).

---

## Priorità

### 1. Watchdog — SPEC §4 (alta priorità tecnica)

Il pezzo architetturale mancante. Dopo ogni risposta dell'agente, controlla se la risposta contraddice un fatto nel ledger → re-inject quel fatto specifico.

**Dove:** `server/server/app/watchdog.py` (nuovo) + hook in `server/server/server.py` (Workflow.run).

**Impatto:** chiude l'unico gap dichiarato nella SPEC; rafforza la garanzia "nessun drift".

### 2. Generalizzazione scenario (alta priorità per credibilità)

`batch_run.py` ha uno script fisso di 8 turn sulla nonna. Renderlo parametrico (caller script da file JSONL) per testare su altri scenari (booking, medical triage, support ticket).

**Dove:** `server/server/batch_run.py` + nuovi fixture in `spec/fixtures/`.

**Impatto:** N=10 su un solo scenario è fragile; N=10 su 3 scenari è convincente.

### 3. Misurazione chiamate lunghe

Caller script di 30+ turn per validare il 7.6× proiettato. Il harness è già pronto — serve solo uno script più lungo e più sessioni.

**Dove:** nuovo `spec/fixtures/long_call_script.jsonl` + aggiunta opzione `--turns` in `batch_run.py`.

### 4. StudierAI integration

Integrare il layer nel loro stack e misurare su call reali. Da coordinare con Daniele (engine).

### 5. SDK packaging (dopo 1-3)

Estrarre `server/server/app/` come pacchetto pip `whisperer-sdk` con builder di configurazione e hook per qualunque voice stack.

---

## Branch strategy

- Questo branch: `feat/gabriele-dev` — lavoro personale pre-coordinamento
- `main` è condiviso + deployato su Vercel — non toccare direttamente
- Quando pronto: PR verso `main` e allineamento con Giovanni e Daniele

---

## Come testare le modifiche

```bash
# Valida il judge sul fixture
python harness/runner.py --mode fixture

# Genera nuova batch (server deve essere nel PATH uv)
cd server
uv run python batch_run.py --mode suggeritore --n 10
uv run python batch_run.py --mode base --n 10

# Scorecard
python harness/runner.py --mode live \
  --base recordings/base_run*.jsonl \
  --suggeritore recordings/sug_run*.jsonl \
  --cost-dir recordings/
```
