# Whisperer — Roadmap post-HackRome

_Responsabile branch: Gabriele Loreti · aggiornato: 2026-06-21_

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
| Watchdog rilevamento drift (SPEC §4) | ✗ progettato, non implementato | — |
| Generalizzazione scenari | ✗ solo scenario "nonna" | `batch_run.py` hardcoded |
| Misurazione chiamate lunghe | ✗ serve validare il 7.6× proiettato | — |
| Trascrizione vocale live (Whisper) | ◐ presente nell'engine (`VoicePipeline` STT→LLM→TTS), assente nella HUD demo (replay di audio pre-registrato) | `server/server/server.py` |
| Integrazione StudierAI | ✗ cliente zero nominale | — |

**Il numero misurato:** recall 0/10 → 10/10 · costo 1.3× misurato su 28 turn (7.6× proiettato su una chiamata da 10-20 min).

---

## Priorità

### 1. Watchdog — SPEC §4 (alta priorità tecnica)

Il pezzo architetturale mancante. Dopo ogni risposta dell'agente, controlla se la risposta contraddice un fatto nel ledger → re-inietta quel fatto specifico.

**Dove:** `server/server/app/watchdog.py` (nuovo) + hook in `server/server/server.py` (`Workflow.run`).

**Impatto:** chiude l'unico gap dichiarato nella SPEC; rafforza la garanzia "nessun drift".

### 2. Generalizzazione scenario (alta priorità per credibilità)

`batch_run.py` ha uno script fisso di 8 turn sulla nonna. Renderlo parametrico (script del chiamante da file JSONL) per testare altri scenari (prenotazioni, triage medico, ticket di supporto).

**Dove:** `server/server/batch_run.py` + nuovi fixture in `spec/fixtures/`.

**Impatto:** N=10 su un solo scenario è fragile; N=10 su 3 scenari è convincente.

### 3. Misurazione chiamate lunghe

Script del chiamante da 30+ turn per validare il 7.6× proiettato. Il harness è già pronto — serve solo uno script più lungo e più sessioni.

**Dove:** nuovo `spec/fixtures/long_call_script.jsonl` + aggiunta dell'opzione `--turns` in `batch_run.py`.

### 4. Integrazione StudierAI

Integrare il layer nel loro stack e misurare su chiamate reali. Da coordinare con Daniele (engine).

### 5. Connettori API reali (pre-deploy obbligatorio)

`server/server/app/mock_api.py` contiene dati hardcodati e funzioni finte. Prima di qualsiasi deploy in produzione va sostituito con connettori reali verso i sistemi dell'utente finale (database ordini, sistema rimborsi, CRM, ecc.).

**Dove:** `server/server/app/mock_api.py` → sostituire con un modulo per cliente (es. `api_shopdemo.py`) che implementa la stessa interfaccia (`get_past_orders()`, `submit_refund_request()`). Il resto del codice non cambia.

**Impatto:** è il punto di integrazione con qualsiasi stack esistente. La struttura è già pensata per questo — `agent_config.py` importa `mock_api` per nome, basta sostituire il modulo.

### 6. SDK packaging (dopo 1-3)

Estrarre `server/server/app/` come pacchetto pip `whisperer-sdk` con builder di configurazione e hook per qualunque voice stack.

### 7. Test di integrazione con piattaforme vocali AI terze (dopo 6)

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

> ⚠️ **Nota (2026-06-21):** una prima versione di questa sezione proponeva di eliminare
> `server/frontend/` e `PITCH.html`. La verifica ha smentito quelle ipotesi: entrambi
> sono file vivi e referenziati. Vedi sotto. **Non eliminare nulla senza prima validare
> i riferimenti** (Makefile, README, import del build).

### File core (da estrarre come SDK)

| File | Ruolo |
|---|---|
| `server/server/app/state_store.py` | Ledger persistente — cuore del layer |
| `server/server/app/distiller.py` | Estrae fatti dalla conversazione |
| `server/server/app/injector.py` | Inietta il ledger nel prompt |
| `server/server/app/cost_meter.py` | Traccia il costo per turno |
| `server/server/app/truncation.py` | Gestisce il cap della context window |
| `server/server/app/__init__.py` | Marcatore strutturale del pacchetto |

### File demo / infrastruttura (utili ma non core SDK)

| File | Ruolo | Note |
|---|---|---|
| `server/server/server.py` | Server WebSocket demo | Sarà sostituito dallo stack del cliente |
| `server/server/app/utils.py` | Gestione WebSocket/audio | Infrastruttura demo, non core |
| `server/server/app/agent_config.py` | Definizione agente demo | Sarà sostituito dall'agente del cliente |
| `server/server/app/mock_api.py` | Database finto | Da sostituire con API reali (vedi punto 5) |
| `server/frontend/` | **Client live** del voice agent (push-to-talk, WebSocket) | Vedi sotto — **non eliminare** |
| `server/server/batch_run.py` | Driver batch per il harness | Keeper — alimenta i benchmark |
| `spec/SPEC.md`, `spec/PROMPTS.md` | Documentazione tecnica | Keeper — base per la doc dell'SDK |
| `spec/fixtures/` | Dati statici per HUD e harness | Keeper |
| `recordings/` | 20 trascrizioni batch reali | Keeper — evidenza dei benchmark |
| `web/` | HUD/dashboard demo su Vercel | Keeper per le demo |

### File che sembravano cruft ma NON lo sono (validato)

| File/Cartella | Cosa è davvero | Perché NON eliminarlo |
|---|---|---|
| `server/frontend/` | Il **client interattivo** del voice agent (AudioChat, push-to-talk) che si connette a `server.py` via WebSocket | Referenziato da `server/Makefile` (`make sync`/`make serve`), `server/README.md` e dal `README.md` principale. **Non** è rimpiazzato da `web/`: `web/` è la dashboard statica su fixture, `server/frontend/` è il client vocale live |
| `PITCH.html` (root) | Lo **script della pitch** da recitare (teleprompter: "cosa dici", prep Q&A, checklist) | **Non** è un duplicato di `web/public/pitch.html`, che è invece lo slide deck interattivo con audio. Sono il copione e lo spettacolo: file diversi (`diff` confermato) |
| `server/evidence/fullcontext-qa/` | **Evidenza di backup** citata nel `README.md`: esperimento full-context (5/10 con context rot) + costo 1.30× misurato | È load-bearing per la pitch e per le honesty notes. Non è un duplicato di `recordings/` |
| `audio nonna/` | Registrazioni sorgente della nonna + `audio_consenso.ogg` (**consenso registrato**) | Valore legale (consenso). Le tracce usate dalla HUD sono in `web/public/audio/`, ma la sorgente + il consenso vivono qui |
| `web/src/lib/fixtures/` | Copia dei fixture interna a `web/` | Probabilmente necessaria per il build Next.js (mock-first, nessun import fuori da `web/`). Il `README.md` dice esplicitamente che `web/` gira senza backend |

### Cruft minore — gestito

| File/Cartella | Sospetto | Esito |
|---|---|---|
| `assets/` | Cartella con solo un `README.md` placeholder per un `demo.gif` mai aggiunto | ✅ **Eliminata** (2026-06-21) — il gif non è mai stato creato e il `README.md` principale non lo referenziava |

### 8. Igiene repo (da fare prima della PR su main, con verifica)

Prima di mergiare `feat/gabriele-dev` su `main` — **niente eliminazioni alla cieca**:

1. **Documentare**, non eliminare: aggiungere un breve commento/README che spieghi la differenza tra `web/` (dashboard statica) e `server/frontend/` (client live), così chi clona non li confonde — è proprio l'errore in cui siamo cascati noi.
2. **Chiarire** `PITCH.html` vs `web/public/pitch.html`: rinominare per evitare ambiguità (es. `PITCH-SCRIPT.html` per il copione) o aggiungere una riga di intestazione in ciascuno.
3. **Documentare** il ruolo di `server/evidence/` nel suo `README.md` (è già presente — verificare che spieghi che è l'esperimento full-context, distinto da `recordings/`).
4. **Decidere** la sorte di `audio nonna/`: se non serve più per i test, spostarla fuori da git (ma **conservare `audio_consenso.ogg`** in un posto sicuro per il valore legale).
5. **Chiarire** la duplicazione `web/src/lib/fixtures/` vs `spec/fixtures/`: confermare che la copia serve al build Next.js e aggiungere un commento, oppure unificare con un symlink/script di sync.
6. ~~**Verificare** `assets/`~~ — ✅ fatto: era un placeholder, eliminata.

---

## Strategia di branch

- Questo branch: `feat/gabriele-dev` — lavoro personale pre-coordinamento
- `main` è condiviso + deployato su Vercel — non toccare direttamente
- Quando pronto: PR verso `main` e allineamento con Giovanni e Daniele

---

## Come testare le modifiche

```bash
# Valida il judge sul fixture
python harness/runner.py --mode fixture

# Genera una nuova batch (il server deve essere nel PATH di uv)
cd server
uv run python batch_run.py --mode suggeritore --n 10
uv run python batch_run.py --mode base --n 10

# Scorecard
python harness/runner.py --mode live \
  --base recordings/base_run*.jsonl \
  --sug recordings/sug_run*.jsonl \
  --cost-dir recordings/
```
