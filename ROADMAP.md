# Whisperer — Roadmap post-HackRome

_Branch: feat/gabriele-dev · aggiornato: 2026-06-24_

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
| Dashboard web | ✓ live su Vercel | `web/` |
| Watchdog rilevamento drift (SPEC §4) | ◐ implementato, opt-in via `SUGGERITORE_WATCHDOG` | `server/server/app/watchdog.py` |
| Generalizzazione scenari | ✓ parametrici via `--scenario` | `batch_run.py`, `spec/fixtures/scenarios/` |
| Misurazione chiamate lunghe | ✓ scenario `long-call` + `--turns` | `spec/fixtures/scenarios/long-call.jsonl` |
| Trascrizione vocale live (Whisper) | ◐ presente nell'engine (`VoicePipeline` STT→LLM→TTS), assente nella HUD demo (replay di audio pre-registrato) | `server/server/server.py` |

**Il numero misurato:** recall 0/10 → 10/10 · costo 1.3× misurato su 28 turn (7.6× proiettato su una chiamata da 10-20 min).

---

## Priorità

### 1. Watchdog — SPEC §4 (✓ implementato, opt-in)

Il pezzo architetturale mancante, ora implementato. Dopo ogni risposta dell'agente, un check leggero (`gpt-4o-mini`, structured output) controlla se la risposta contraddice un fatto nel ledger → re-inietta quel fatto specifico e fa ri-rispondere l'agente.

**Dove:** `server/server/app/watchdog.py` + hook in `server/server/server.py` (`Workflow.run`).

**Attivazione:** `SUGGERITORE_WATCHDOG=on` (default off). Spento, il build resta sul re-grounding periodico — il default sicuro sotto cui è stato misurato il numero. Acceso, attiva il comportamento re-answer fedele alla SPEC §4.

**Impatto:** chiude l'unico gap dichiarato nella SPEC; rafforza la garanzia "nessun drift".

### 2. Generalizzazione scenario (✓ fatto)

`batch_run.py` non è più hardcodato sulla nonna. Script del chiamante, seeded_fact, identity/objective e recall_markers vivono in `spec/fixtures/scenarios/` (manifest `index.json` + un file-script `.jsonl` per scenario, un turn per riga; l'ultima riga è la domanda di recall). Si seleziona con `--scenario <id>` (default `nonna`); `harness/runner.py` carica la seeded_fact corrispondente con `--scenario`. Le registrazioni sono prefissate per scenario (`recordings/<id>_base_run*.jsonl`). Scenari attuali: `nonna`, `reso`, `cambio-consegna`, `long-call`.

**Dove:** `server/server/batch_run.py`, `harness/runner.py`, `spec/fixtures/scenarios/`.

**Impatto:** N=10 su un solo scenario è fragile; N=10 su più scenari è convincente.

### 3. Misurazione chiamate lunghe (✓ fatto)

Scenario `long-call` (32 turn del chiamante) per validare la direzione del 7.6× proiettato. `--turns N` in `batch_run.py` cappa la chiamata ai primi N turn (la riga di recall è sempre preservata in coda), così si fa lo sweep della lunghezza da un unico script.

**Dove:** `spec/fixtures/scenarios/long-call.jsonl` + opzione `--turns` in `batch_run.py`.

**Da fare:** generare le batch e annotare il rapporto di costo osservato (serve un `.env` con `OPENAI_API_KEY`).

### 4. Connettori API reali (✓ struttura pronta, pre-deploy)

I dati hardcodati vivono ora in `server/server/app/api_shopdemo.py` (ex `mock_api.py`), il connettore demo di riferimento. Prima di un deploy in produzione si aggiunge un modulo per cliente verso i sistemi reali (database ordini, sistema rimborsi, CRM, ecc.).

**Come:** copiare `server/server/app/api_template.py.example` in `api_<cliente>.py`, implementare `get_past_orders()` e `submit_refund_request()` verso i sistemi reali, poi selezionarlo con `WHISPERER_API_CONNECTOR=api_<cliente>` (default `api_shopdemo`). Il loader è `server/server/app/connectors.py` (Protocol `ApiConnector` + `load_connector`); `agent_config.py` lo carica per nome. Il resto del codice non cambia.

**Impatto:** è il punto di integrazione con qualsiasi stack esistente. Lo swap è plug-in (nuovo file + env var, nessuna modifica all'agente).

### 5. SDK packaging (✓ fatto)

Estrarre `server/server/app/` come pacchetto pip `whisperer-sdk` con builder di configurazione e hook per qualunque voice stack.

### 6. Test di integrazione con piattaforme vocali AI terze (dopo 5)

Whisperer è un memory layer — il suo valore è potersi agganciare a qualsiasi voice AI stack già esistente. Va validato su piattaforme reali oltre alla demo standalone.

**Target suggeriti (in ordine di priorità):**
- **GPT-4o Realtime API** — il caso più naturale, già architetturalmente vicino
- **Vapi / Bland.ai / Retell** — piattaforme voice agent commerciali con hook middleware
- **ElevenLabs Conversational AI** — forte sul TTS, usato da molti prodotti voce
- **Stack open source** (es. Whisper + Ollama + Coqui TTS) — per clienti on-premise

**Come:** per ogni piattaforma, agganciare `distill()` e `compact_input()` nel punto in cui il testo trascritto entra nel prompt, poi runnare il harness esistente:

```bash
uv run python batch_run.py --mode base --n 10
uv run python batch_run.py --mode suggeritore --n 10
python harness/runner.py --mode live \
  --base recordings/base_run*.jsonl \
  --sug  recordings/sug_run*.jsonl \
  --cost-dir recordings/
```

Il punteggio (`X/10 recall`, costo medio) diventa la scorecard di quella integrazione.

**Impatto:** trasforma Whisperer da demo standalone a layer certificato su N piattaforme — ogni integrazione riuscita ha un numero che la prova. Dà anche al harness una vita continuativa oltre l'hackathon: ogni nuova piattaforma è una nuova riga di scorecard, non un one-shot.

---

## Mappa della repo — cosa è cosa

> ⚠️ **Nota:** prima di eliminare qualcosa, **validare sempre i riferimenti** (Makefile,
> README, import del build, link del web). Es. `server/frontend/` sembrava cruft ma è il
> client vocale live (vedi sotto). I file pitch (`PITCH.html`, `web/public/pitch.html`) sono
> stati invece **eliminati (2026-06-24)**: materiale da hackathon, non più necessario.

### File core (✓ estratti come SDK `whisperer-sdk` in `sdk/whisperer/`)

Il server li consuma come path dependency editable (`server/server/pyproject.toml` →
`[tool.uv.sources]`). Pacchetto installabile anche standalone (`pip install -e sdk`).

| File | Ruolo |
|---|---|
| `sdk/whisperer/state_store.py` | Ledger persistente — cuore del layer |
| `sdk/whisperer/distiller.py` | Estrae fatti dalla conversazione |
| `sdk/whisperer/injector.py` | Inietta il ledger nel prompt |
| `sdk/whisperer/cost_meter.py` | Traccia il costo per turno |
| `sdk/whisperer/truncation.py` | Gestisce il cap della context window |
| `sdk/whisperer/watchdog.py` | Drift guard SPEC §4 (opt-in) |
| `sdk/whisperer/connectors.py` | Contratto `ApiConnector` + loader per-cliente |
| `sdk/whisperer/__init__.py` | API pubblica del pacchetto (i due hook + i building block) |

### File demo / infrastruttura (utili ma non core SDK)

| File | Ruolo | Note |
|---|---|---|
| `server/server/server.py` | Server WebSocket demo | Sarà sostituito dallo stack del cliente |
| `server/server/app/utils.py` | Gestione WebSocket/audio | Infrastruttura demo, non core |
| `server/server/app/agent_config.py` | Definizione agente demo | Sarà sostituito dall'agente del cliente |
| `server/server/app/api_shopdemo.py` | Connettore demo (ex `mock_api.py`) | Riferimento per i connettori reali (vedi punto 5) |
| `server/frontend/` | **Client live** del voice agent (push-to-talk, WebSocket) | Vedi sotto — **non eliminare** |
| `server/server/batch_run.py` | Driver batch per il harness | Keeper — alimenta i benchmark |
| `spec/SPEC.md`, `spec/PROMPTS.md` | Documentazione tecnica | Keeper — base per la doc dell'SDK |
| `spec/fixtures/` | Dati statici per HUD e harness (incl. `scenarios/`: manifest + script per scenario) | Keeper |
| `recordings/` | 20 trascrizioni batch reali | Keeper — evidenza dei benchmark |
| `web/` | HUD/dashboard demo su Vercel | Keeper per le demo |

### File che sembravano cruft ma NON lo sono (validato)

| File/Cartella | Cosa è davvero | Perché NON eliminarlo |
|---|---|---|
| `server/frontend/` | Il **client interattivo** del voice agent (AudioChat, push-to-talk) che si connette a `server.py` via WebSocket | Referenziato da `server/Makefile` (`make sync`/`make serve`), `server/README.md` e dal `README.md` principale. **Non** è rimpiazzato da `web/`: `web/` è la dashboard statica su fixture, `server/frontend/` è il client vocale live |
| `server/evidence/fullcontext-qa/` | **Evidenza di backup** citata nel `README.md`: esperimento full-context (5/10 con context rot) + costo 1.30× misurato | È load-bearing per le honesty notes. Non è un duplicato di `recordings/` |
| `audio nonna/` | Registrazioni sorgente della nonna + `audio_consenso.ogg` (**consenso registrato**) | Valore legale (consenso). Le tracce usate dalla HUD sono in `web/public/audio/`, ma la sorgente + il consenso vivono qui |
| `web/src/lib/fixtures/` | Copia dei fixture interna a `web/` (vedi `web/src/lib/fixtures/README.md`) | Necessaria per il build Next.js (mock-first, nessun import fuori da `web/`); sorgente canonica `spec/fixtures/`. Il `README.md` dice esplicitamente che `web/` gira senza backend |

### Cruft minore — gestito

| File/Cartella | Sospetto | Esito |
|---|---|---|
| `assets/` | Cartella con solo un `README.md` placeholder per un `demo.gif` mai aggiunto | ✅ **Eliminata** (2026-06-21) — il gif non è mai stato creato e il `README.md` principale non lo referenziava |

### 7. Igiene repo (da fare prima della PR su main, con verifica)

Prima di mergiare `feat/gabriele-dev` su `main` — **niente eliminazioni alla cieca**:

1. ~~**Documentare** `web/` (dashboard statica) vs `server/frontend/` (client live)~~ — ✅ fatto: `server/frontend/README.md` chiarisce la differenza (più riga nella "Repo layout" del `README.md`).
2. ~~**Chiarire** `PITCH.html` vs `web/public/pitch.html`~~ — ✅ risolto eliminandoli (2026-06-24): erano materiale da hackathon, non più necessario. Nessun codice li referenziava.
3. ~~**Documentare** `server/evidence/`~~ — ✅ verificato: `server/evidence/fullcontext-qa/README.md` spiega l'esperimento full-context, distinto dal numero shipped e da `recordings/`.
4. ~~**Decidere** la sorte di `audio nonna/`~~ — ✅ mantenuta in repo con `audio nonna/README.md` che marca `audio_consenso.ogg` come consenso legale da conservare. (Non spostata fuori da git senza ok esplicito.)
5. ~~**Chiarire** `web/src/lib/fixtures/` vs `spec/fixtures/`~~ — ✅ fatto: `web/src/lib/fixtures/README.md` conferma che è la copia build-time per Next.js (sorgente canonica: `spec/fixtures/`). Niente symlink su Windows.
6. ~~**Verificare** `assets/`~~ — ✅ fatto: era un placeholder, eliminata.

---

## Strategia di branch

- Questo branch: `feat/gabriele-dev` — lavoro personale pre-coordinamento
- `main` è condiviso + deployato su Vercel — non toccare direttamente
- Quando pronto: PR verso `main` e allineamento con Giovanni e Daniele

---

## Come testare le modifiche

```bash
# Valida il judge sul fixture (scenario nonna, invariato)
python harness/runner.py --mode fixture

# Genera una nuova batch per uno scenario (default: nonna)
cd server/server
uv run python batch_run.py --mode suggeritore --n 10 --scenario reso
uv run python batch_run.py --mode base        --n 10 --scenario reso

# Chiamata lunga: sweep della durata con --turns
uv run python batch_run.py --mode base --scenario long-call --turns 20

# Scorecard (passa --scenario per la seeded_fact e per scopare i file costo giusti)
python harness/runner.py --mode live --scenario reso \
  --base recordings/reso_base_run*.jsonl \
  --sug  recordings/reso_sug_run*.jsonl \
  --cost-dir recordings/
```
