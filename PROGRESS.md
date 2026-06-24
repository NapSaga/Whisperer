# Whisperer — Progresso del progetto

_Tracker vivo. Progetto vincitore di **HackRome (13 giu 2026)**, in sviluppo continuo post-hackathon._
_Ultimo aggiornamento: **2026-06-24**._

Documento di sintesi: per il dettaglio tecnico e le priorità complete vedi [`ROADMAP.md`](ROADMAP.md); per l'overview del prodotto [`README.md`](README.md).

---

## Stato in breve

Il core del memory layer è **completo e misurato**. Il numero che regge la pitch:

| Metrica | Base (senza layer) | Whisperer | Note |
|---|---|---|---|
| **Recall a 64 turn** (long-call, N=5) | **0/5** (dimentica) | **5/5** | base *capped* |
| **Costo** (long-call, N=5) | $1.36 (full-context) | $0.65 | **2.1×** a 64 turn |
| **Recall** scenario corto "nonna" (N=10) | 0/10 | 10/10 | numero originale |

Il rapporto di costo **cresce con la durata** della chiamata (1.3× a 28 turn → 2.1× a 64 turn), nella direzione del **7.6×** proiettato su una chiamata reale da 10–20 min. Forgetting e costo sono accoppiati: il base resta economico solo *cappato* (e allora dimentica), mentre full-context ricorda ~4/5 ma costa 2.1×. Whisperer ricorda 5/5 **e** sta piatto sul costo.

---

## Ultimo lavoro — Gabriele (2026-06-24)

Cinque commit su `feat/gabriele-dev`, ora su `main`. In sintesi:

1. **Scenari parametrici** (`258a576`) — `batch_run.py` e `harness/runner.py` non sono più cablati sullo scenario "nonna". Script del chiamante, `seeded_fact`, identity/objective e `recall_markers` vivono in `spec/fixtures/scenarios/` (manifest `index.json` + un file-script `.jsonl` per scenario, ultima riga = domanda di recall). Selezione con `--scenario <id>` (default `nonna`). Scenari disponibili: **`nonna`, `reso`, `cambio-consegna`, `long-call`**.
2. **Misurazione chiamate lunghe** (`258a576`, `12e61db`, `5aaa77f`) — nuovo scenario `long-call` (32 turn) + opzione `--turns N` per fare lo sweep della durata da un unico script (la riga di recall resta sempre in coda). **Numeri misurati davvero** (N=5, 64 turn) e committati in `recordings/long-call_*` (recall) e `recordings/uncapped/` (costo full-context).
3. **Fix scoring harness** (`5aaa77f`) — `run_live` ora ignora i file `*_cost.jsonl`, che un glob shell pescava gonfiando il denominatore del judge. I comandi documentati ora funzionano.
4. **Igiene repo** (`b588f5a`) — nuovi README esplicativi (`server/frontend/` = client vocale live ≠ dashboard `web/`; `audio nonna/` segna `audio_consenso.ogg` come consenso legale; `web/src/lib/fixtures/` = copia build-time). Eliminati i file pitch (`PITCH.html`, `web/public/pitch.html`): materiale da hackathon non più referenziato. **Rimossi** dalla roadmap i riferimenti a StudierAI (customer-zero) e la divisione rigida dei ruoli — ora si lavora tutti su tutto.
5. **Note di riproducibilità** (`8aef8c1`) — chiarito che solo l'evidenza `long-call` è committata; gli altri scenari si rigenerano con `--scenario`.

---

## Prossimi step (dalla roadmap)

Il core è chiuso (#1 Watchdog, #2 scenari, #3 chiamate lunghe, #5 SDK packaging tutti ✓). Resta da fare:

- **Integrazione piattaforme vocali AI terze** (roadmap #6) — è il passo che trasforma Whisperer da demo standalone a layer certificato su N stack. Per ciascuna piattaforma: agganciare `distill()` + `compact_input()` dove il testo trascritto entra nel prompt, poi girare il harness per ottenere la scorecard (`X/10 recall`, costo). Target in ordine: **GPT-4o Realtime API** → **Vapi / Bland.ai / Retell** → **ElevenLabs Conversational AI** → **stack open source** (Whisper + Ollama + Coqui TTS).
- **Connettori API reali per-cliente** (roadmap #4, pre-deploy) — al momento dell'integrazione, copiare `server/server/app/api_template.py.example` in `api_<cliente>.py`, implementare `get_past_orders()` / `submit_refund_request()` verso i sistemi reali, e selezionarlo con `WHISPERER_API_CONNECTOR=api_<cliente>`. Swap plug-in, nessuna modifica all'agente.
- **Scorecard multi-scenario** — girare N=10 su `reso` e `cambio-consegna` (oggi è committata solo l'evidenza `long-call`; gli altri si rigenerano). N=10 su più scenari rende il 10/10 una proprietà del layer, non un caso singolo.

---

## Come riprodurre i numeri

```bash
# Valida il judge sul fixture (scenario nonna, invariato)
python harness/runner.py --mode fixture

# Genera una batch per uno scenario (richiede chiave OpenAI in .env)
cd server/server
uv run python batch_run.py --mode suggeritore --n 10 --scenario reso
uv run python batch_run.py --mode base        --n 10 --scenario reso

# Chiamata lunga: sweep della durata
uv run python batch_run.py --mode base --scenario long-call --turns 20

# Scorecard (--scenario seleziona seeded_fact e i file giusti)
python harness/runner.py --mode live --scenario reso \
  --base recordings/reso_base_run*.jsonl \
  --sug  recordings/reso_sug_run*.jsonl \
  --cost-dir recordings/
```
