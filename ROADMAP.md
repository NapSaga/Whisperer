# Whisperer — Roadmap post-HackRome

_Su `main` (workflow main-only) · aggiornato: 2026-06-29_

---

## ▶ Riprendi da qui (prossima sessione)

**Smoke-test del server live: ✓ COMPLETO** — testo (A1) + audio (A2) entrambi passati.

**Prossima azione:** **B5 — chiamata lunga reale** (~15 min, ~5€).
- Config: `SUGGERITORE_MODE=on`, `SUGGERITORE_WATCHDOG=off`, `SUGGERITORE_DISTILL_EVERY=2`.
- Semina un fatto all'inizio, chiedi la recall verso la fine.
- Verifica: ledger si popola nel pannello, recall corretto a distanza, nessuna eccezione nei log.
- Poi, opzionale: stessa chiamata con `SUGGERITORE_MODE=off` per il contrasto.

**Fatto nella sessione 2026-06-29 (punto 7 + infra):**
- **Pannello "Live memory"** nel client live (`server/frontend/`): facts/commitments in
  real-time via messaggio WebSocket `state.updated` (push dal server dopo ogni distill e on-connect).
- **Fix `.env`**: `server.py` carica il `.env` di root in modo affidabile (ancorato a `__file__`,
  non alla cwd) — prima `make serve` (cwd `server/server`) cercava un inesistente `server/.env`.
- **Fix display chat**: in `SUGGERITORE_MODE=on` la chat non collassa più e non mostra il ledger
  come "system prompt" — lo storico visibile è ora separato dall'input compatto del modello
  (flag `compact` in `WebsocketHelper.text_output_complete` + `Workflow.run`).
- **Path runtime chiarito**: il ledger live vive in `sdk/run/state.json` (dopo l'estrazione SDK
  `parents[1]` è `sdk/`), non in `server/server/run/`. Override con `SUGGERITORE_STATE_PATH`.
- **Repo tradotto in inglese** (HUD `web/` + docs); `PROGRESS.md` eliminato (ridondante); questo
  `ROADMAP.md` resta in italiano per scelta.

**Note da non perdere:** budget ~50€/~5€ a call → credito solo per B5 · il reloader di
uvicorn si impalla dopo il primo reload, **riavvia il backend a mano** (`Ctrl-C` + `npm run dev`
in `server/frontend/`) dopo le modifiche al server · watchdog tenuto **off** in demo (recall
invariato, latenza minima) · ElevenLabs **non** serve nel path VoicePipeline (solo
`OPENAI_API_KEY`) · il ledger live vive in `sdk/run/state.json`, non in `server/server/run/`.

---

## Stato attuale

Il core è completo e misurato:

| Componente | Stato | File |
|---|---|---|
| Distiller (SPEC §2) | ✓ | `sdk/whisperer/distiller.py` |
| Injector + compact_input (SPEC §3) | ✓ | `sdk/whisperer/injector.py` |
| State store / ledger (SPEC §1) | ✓ | `sdk/whisperer/state_store.py` |
| Cost meter (SPEC §5) | ✓ | `sdk/whisperer/cost_meter.py` |
| Judge binario (SPEC §6) | ✓ | `harness/judge.py` |
| Batch runner N=10 (SPEC §6) | ✓ | `server/server/batch_run.py`, `harness/runner.py` |
| Dashboard web | ✓ live su Vercel | `web/` |
| Watchdog rilevamento drift (SPEC §4) | ✓ default on via `SUGGERITORE_WATCHDOG` | `sdk/whisperer/watchdog.py` |
| Generalizzazione scenari | ✓ parametrici via `--scenario` | `batch_run.py`, `spec/fixtures/scenarios/` |
| Misurazione chiamate lunghe | ✓ scenario `long-call` + `--turns` | `spec/fixtures/scenarios/long-call.jsonl` |
| Demo live real-time (punto 7) | ◐ smoke-test completo (testo A1 + audio A2, 2026-06-29); pannello "Live memory" live; manca solo B5 — chiamata lunga reale (~15 min, ~5€) | `server/server/server.py`, `server/frontend/` |

**Il numero misurato:** recall 0/10 → 10/10 · costo 1.3× misurato su 28 turn (7.6× proiettato su una chiamata da 10-20 min).

---

## Priorità

### 1. Watchdog — SPEC §4 (✓ implementato, default on)

Il pezzo architetturale mancante, ora implementato e **attivo di default**. Dopo ogni risposta dell'agente, un check leggero (`gpt-4o-mini`, structured output) controlla se la risposta contraddice un fatto nel ledger → re-inietta quel fatto specifico e fa ri-rispondere l'agente.

**Dove:** `sdk/whisperer/watchdog.py` + hook in `server/server/server.py` (`Workflow.run`).

**Attivazione:** `SUGGERITORE_WATCHDOG=on` (**default on**). È il comportamento re-answer fedele alla SPEC §4 ed è ora il default di prodotto. Il recall negli scenari misurati è identico con flag on/off (il layer fa già recall pieno); il watchdog blinda il caso di contraddizione che il re-grounding periodico non copre.

**Nota onesta:** il **numero di costo pubblicato** è stato misurato con il watchdog **spento** (re-grounding only). Per riprodurre quel baseline: `SUGGERITORE_WATCHDOG=off`. Acceso, aggiunge una chiamata `gpt-4o-mini` per turno (costo leggermente più alto, latenza extra — da tenere d'occhio sulla demo live, punto 7).

**Impatto:** chiude l'unico gap dichiarato nella SPEC; rafforza la garanzia "nessun drift".

### 2. Generalizzazione scenario (✓ fatto)

`batch_run.py` non è più hardcodato sulla nonna. Script del chiamante, seeded_fact, identity/objective e recall_markers vivono in `spec/fixtures/scenarios/` (manifest `index.json` + un file-script `.jsonl` per scenario, un turn per riga; l'ultima riga è la domanda di recall). Si seleziona con `--scenario <id>` (default `nonna`); `harness/runner.py` carica la seeded_fact corrispondente con `--scenario`. Le registrazioni sono prefissate per scenario (`recordings/<id>_base_run*.jsonl`). Scenari attuali: `nonna`, `reso`, `cambio-consegna`, `long-call`.

**Dove:** `server/server/batch_run.py`, `harness/runner.py`, `spec/fixtures/scenarios/`.

**Impatto:** N=10 su un solo scenario è fragile; N=10 su più scenari è convincente.

### 3. Misurazione chiamate lunghe (✓ fatto)

Scenario `long-call` (32 turn del chiamante) per validare la direzione del 7.6× proiettato. `--turns N` in `batch_run.py` cappa la chiamata ai primi N turn (la riga di recall è sempre preservata in coda), così si fa lo sweep della lunghezza da un unico script.

**Dove:** `spec/fixtures/scenarios/long-call.jsonl` + opzione `--turns` in `batch_run.py`.

**Misurato (2026-06-24, N=5, lente audio-priced):**
- **Recall a 64 turn:** base capped **0/5** (dimentica) → suggeritore **5/5**.
- **Costo, base full-context** (uncapped, `SUGGERITORE_BASE_CAP=0`) vs suggeritore: **$1.36 vs $0.65 → 2.1×**. Il rapporto **cresce con la durata** (1.3× a 28 turn nell'evidence, 2.1× a 64 turn), nella direzione della proiezione 7.6× su una chiamata da 10–20 min.
- **Nota onesta:** forgetting e costo sono accoppiati. Col base **capped** (default che produce lo 0/10) il base resta economico e non esplode; il numero di costo si misura sul base **full-context**, che però ricorda ~4/5 (context rot a 64 turn). Whisperer ricorda 5/5 *e* sta piatto.

### 4. Connettori API reali (✓ struttura pronta, pre-deploy)

I dati hardcodati vivono ora in `server/server/app/api_shopdemo.py` (ex `mock_api.py`), il connettore demo di riferimento. Prima di un deploy in produzione si aggiunge un modulo per cliente verso i sistemi reali (database ordini, sistema rimborsi, CRM, ecc.).

**Come:** copiare `server/server/app/api_template.py.example` in `api_<cliente>.py`, implementare `get_past_orders()` e `submit_refund_request()` verso i sistemi reali, poi selezionarlo con `WHISPERER_API_CONNECTOR=api_<cliente>` (default `api_shopdemo`). Il loader è `sdk/whisperer/connectors.py` (Protocol `ApiConnector` + `load_connector`); `agent_config.py` lo carica per nome. Il resto del codice non cambia.

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
uv run python batch_run.py --mode base        --n 10 --scenario nonna
uv run python batch_run.py --mode suggeritore  --n 10 --scenario nonna
python harness/runner.py --mode live --scenario nonna \
  --base recordings/nonna_base_run*.jsonl \
  --sug  recordings/nonna_sug_run*.jsonl \
  --cost-dir recordings/
```

Il punteggio (`X/10 recall`, costo medio) diventa la scorecard di quella integrazione.

**Impatto:** trasforma Whisperer da demo standalone a layer certificato su N piattaforme — ogni integrazione riuscita ha un numero che la prova. Dà anche al harness una vita continuativa oltre l'hackathon: ogni nuova piattaforma è una nuova riga di scorecard, non un one-shot.

### 7. Demo live real-time — interfaccia + implementazione real-time (in corso)

Task dal team (audio, 2026-06-26): **prendere in mano la configurazione della demo live** e costruire un'**interfaccia** con **implementazione real-time** — un vero *demo product*, non il replay di audio pre-registrato dell'attuale HUD. Tenerla **semplice**, non sovra-ingegnerizzata ("una complessa è troppo, facciamone una semplice").

**Fatto (2026-06-29):** client live `server/frontend/` collegato all'engine + **pannello "Live memory"** che mostra facts/commitments accumularsi in real-time (push WebSocket `state.updated`); fix `.env` e fix display chat; smoke-test completo (A1 testo + A2 audio — STT→LLM→TTS confermato con ledger che si popola e recall funzionante dalla voce).

**Da fare:** **B5 — chiamata lunga reale** (~15 min, ~5€) — il recall su durata vera, il passo finale.

**Workstream:**
- **Front:** ✓ interfaccia + pannello memoria live. — **Back:** ✓ push dello state + connettore demo `api_shopdemo`.
- **Poi:** **test lunghi** (~15 min, ~5€ a chiamata) per verificare il recall del contatto, usando i ~50€ di credito disponibili.

**Obiettivo:** dimostrare su una **prova reale** (use case voice/commerce) che il problema concreto — drift / perdita del filo su chiamate lunghe — è risolto, in real-time e su modello reale.

**Dove:** collegare `server/frontend/` (client vocale live già esistente, push-to-talk via WebSocket) all'engine `VoicePipeline` (STT→LLM→TTS) di `server/server/server.py`. È esattamente il pezzo segnato ◐ in "Stato attuale": trascrizione vocale live presente nell'engine ma assente nella HUD demo.

> ⚠️ Audio parzialmente illeggibile: nucleo (interfaccia + real-time + chi lo prende in mano) chiaro; dettagli su credito/durata test ricostruiti, da confermare col team.

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
| `sdk/whisperer/watchdog.py` | Drift guard SPEC §4 (default on) |
| `sdk/whisperer/connectors.py` | Contratto `ApiConnector` + loader per-cliente |
| `sdk/whisperer/__init__.py` | API pubblica del pacchetto (i due hook + i building block) |

### File demo / infrastruttura (utili ma non core SDK)

| File | Ruolo | Note |
|---|---|---|
| `server/server/server.py` | Server WebSocket demo | Sarà sostituito dallo stack del cliente |
| `server/server/app/utils.py` | Gestione WebSocket/audio | Infrastruttura demo, non core |
| `server/server/app/agent_config.py` | Definizione agente demo | Sarà sostituito dall'agente del cliente |
| `server/server/app/api_shopdemo.py` | Connettore demo (ex `mock_api.py`) | Riferimento per i connettori reali (vedi punto 4) |
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

### Igiene repo (✓ fatta — completata prima del merge su `main`)

Svolta con verifica, **niente eliminazioni alla cieca**:

1. ~~**Documentare** `web/` (dashboard statica) vs `server/frontend/` (client live)~~ — ✅ fatto: `server/frontend/README.md` chiarisce la differenza (più riga nella "Repo layout" del `README.md`).
2. ~~**Chiarire** `PITCH.html` vs `web/public/pitch.html`~~ — ✅ risolto eliminandoli (2026-06-24): erano materiale da hackathon, non più necessario. Nessun codice li referenziava.
3. ~~**Documentare** `server/evidence/`~~ — ✅ verificato: `server/evidence/fullcontext-qa/README.md` spiega l'esperimento full-context, distinto dal numero shipped e da `recordings/`.
4. ~~**Decidere** la sorte di `audio nonna/`~~ — ✅ mantenuta in repo con `audio nonna/README.md` che marca `audio_consenso.ogg` come consenso legale da conservare. (Non spostata fuori da git senza ok esplicito.)
5. ~~**Chiarire** `web/src/lib/fixtures/` vs `spec/fixtures/`~~ — ✅ fatto: `web/src/lib/fixtures/README.md` conferma che è la copia build-time per Next.js (sorgente canonica: `spec/fixtures/`). Niente symlink su Windows.
6. ~~**Verificare** `assets/`~~ — ✅ fatto: era un placeholder, eliminata.

---

## Strategia di branch

- **Workflow main-only (dal 2026-06-26):** si lavora e si pusha direttamente su `main`. Il branch `feat/gabriele-dev` è stato fuso e silurato.
- `main` è condiviso + deployato su Vercel: **ogni push fa partire un deploy in produzione** — committa con criterio.

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
