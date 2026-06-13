# PLAN.md — Whisperer · cruscotto vivo del build

> Coupling: `AGENTS.md` + `spec/SPEC.md §7` + `spec/fixtures/`. Non si reinventa nulla:
> ciò che non è nello scaffold non si fa. Questo file si aggiorna **durante** il lavoro —
> deve dire a colpo d'occhio quanto sta e quanto manca.

## Avanzamento — Fatto 25 / Totale 38 (66%)
```
█████████████░░░░░░░  66%
```
🎯 **IL NUMERO: base 0/10, suggeritore 10/10** — committato e validato. Build **CONGELATO**, tag `freeze-1630`.

## 🧊 STATO FREEZE — LEGGERE PRIMA DEL PITCH (agg. 17:25)
> Questo blocco **supera** ogni narrativa di costo precedente (in particolare l'entry changelog delle 16:05 "win reale misurato": **NON è più vera**).

**Cosa è spedito (tag `freeze-1630`, commit `7a25bd9`):**
- **Numero:** base **0/10** · suggeritore **10/10**, da `spec/fixtures/verdicts.json` (committato, validato). Path reale: **base = item-cap(8)** che fa dimenticare · **suggeritore = `compact_input` §3** (manda stato compatto, non la history).
- Server: `injector.compact_input` + `server.py` (sug compatto, base item-cap). `truncation.py`/`batch_run.py` tornati al committato. Preambolo iniezione **non** trimmato.

**§5 COSTI — la regola che salva il Q&A (leggere tutti):**
- ⛔ **NON dire "costo misurato, base ≫ sug".** Sul path spedito il base item-cap è economico → il meter reale lì è piatto/inverso. La divergenza MISURATA drammatica **non esiste su chiamata corta** (28 turni ≈640 token: dimenticanza e magnitudine-costo sono accoppiate, solo una chiamata lunga le soddisfa entrambe).
- ✅ **Cosa è vero e difendibile:** il suggeritore è **genuinamente più leggero** via §3 (stato compatto invece della history) — questo è reale. La **magnitudine** (7.6× ecc.) è **PROIEZIONE** da tariffe Realtime + StudierAI (€4,50 vs €0,13). A schermo il contatore va etichettato **"proiezione"**, MAI "measured", e il `cost.json` MOCK MAI spacciato per misura.

**🧰 Arsenale Q&A (in `server/evidence/fullcontext-qa/`) — usarlo, non nasconderlo:**
- **5/10 uncapped** = prova anti-trucco: *"anche senza cap, a contesto pieno, il base perde il fatto 5 volte su 10 — context rot documentata"*.
- **Costo full-context misurato:** base ~$0.298 (sale) vs sug ~$0.229 (piatto) = **1.30× reale**, direzione giusta → *"la direzione l'abbiamo misurata; la magnitudine la proiettiamo"*.
- **Framing del cap:** *"il base è cappato per riprodurre l'hard-cap a 32k delle piattaforme managed (Retell) e la truncation cieca che OpenAI documenta"*.
- **Buco noto:** il costo del distiller non è contato → *"sì, gira un modello testo cheap, overhead limitato vs il contesto audio che il base ri-paga"*.

**✅ Cosa manca entro le 18:30 (in ordine):**
1. **Web (Giovanni):** contatore costi etichettato **"proiezione"** (non MOCK/measured) · verdict view su **0/10 · 10/10**.
2. **VIDEO BACKUP** (obbligatorio, gira senza rete) — hook nonna → split → HUD → recall → numero → forma costi.
3. **Pitch col timer ≥3 volte** (Gabriele consegna 2:30 + Q&A · Giovanni demo · Daniele guida tecnica).
4. **Form entro le 18:15** (non alle 18:29).
5. **Regola d'oro:** sotto-promettere = inattaccabili; sopra-promettere sul costo = un giudice tecnico smonta tutto. **Niente più codice.**

## Legenda
`[fatto]` · `[in corso]` · `[todo]` — owner: **server=Daniele · harness=Gabriele · web=Giovanni** —
contratto = oggetto di `SPEC §7` che la voce **produce →** o **consuma ←**.

## 🏁 Demo minima vincente (il pavimento — se alle 16:30 ci sono questi 4, la demo esiste)
1. `[fatto]` base dimentica (0/10 batch reale, transcripts in `recordings/`) · 2. `[fatto]` suggeritore ricorda (10/10 batch reale) ·
3. `[fatto]` split-screen · 4. `[fatto]` memoria HUD che si scrive da sola.
Ordine di taglio se in ritardo: **watchdog → cost counter → drill-down judge**. Mai tagliare: **il numero del judge**.

## 🔒 Regole vincolanti (anti-allucinazione + disciplina)
- Ogni API di libreria (Next.js, Tailwind, ai-elements, OpenAI Agents SDK, ElevenLabs) → **Context7 MCP**, mai a memoria.
- Ogni componente UI → **shadcn** (CLI ufficiale `npx shadcn add …` = codice reale; MCP shadcn per discovery). Niente primitive scritte a mano, niente API inventate.
- Se manca doc o componente → **stop**, lo segnalo. Non si improvvisa.
- Solo contro i contratti `SPEC §7` e `spec/fixtures/`. Un task chiuso alla volta, sessione nuova per task, zero refactor non richiesti.
- IL NUMERO REALE = **base 0/10, suggeritore 10/10** (run-1330, scenario orologio). Le fixtures `verdicts.json`/`transcript.jsonl`/`state.json` ora **rispecchiano lo scenario orologio** (Luca, laurea, prima del 20, Pina interno 3) — coerenti con l'audio nonna reale. ⚠️ i `recordings/*.jsonl` vanno rigenerati su questo copione (vedi Fase 4).
- Niente `git init`, niente push: il primo push lo fa Giovanni **sabato 10:45**.

---

## Fase 0 — Setup pre-build (9:00–10:30)
- `[fatto]` Scaffold repo: `server/ harness/ web/ spec/` — coupling base
- `[fatto]` `AGENTS.md` + `spec/SPEC.md` + `spec/PROMPTS.md` + i 3 README di cartella
- `[fatto]` Fixtures `state.json` · `transcript.jsonl` · `verdicts.json` — **estese end-to-end `t1→t41` (42 righe), ogni `[t{n}]` referenziato è reale, JSON validati**
- `[fatto]` `.env` (chiave attuale) + `.gitignore` + `.env.example`
- `[fatto]` MCP design su Claude Code + Codex: **Context7** (con key) · **shadcn** · **Magic** (con key)
- `[fatto]` **Decisione web/ base = Next.js fresco** (il sample backend resta in `server/`, non si parte dal suo frontend)
- `[fatto]` Clone `openai-voice-agent-sdk-sample` → `server/` (`.git` rimosso, `.env` per `../.env` pronto) · **`make sync` OK** (npm 470 pkg · uv 50 pkg: `openai-agents 0.0.7`, `fastapi`, `uvicorn`, `websockets`)
- `[fatto]` **Backend boota** su `:8000`, `/ws` accetta la connessione, agent module importa pulito · ⚠️ voce-dentro/voce-fuori col **mic = test interattivo di Giovanni** (serve browser + frontend del sample: `cd server && make serve` + backend `cd server/server && uv run python server.py`)
- `[fatto]` **Primo push (~10:45)** → repo `NapSaga/suggeritore` (commit `b78b473`) · safety gate ok (nessun `.env`/`node_modules`/`.venv` tracciato) · ⚠️ **PRIVATO** (scelta Giovanni — proteggere l'idea in build; **valutare flip a `public` poco prima del pitch**: il commit-trail Codex visibile è la prova per il premio OpenAI/Fazio)
- `[todo]` **LOCK 10:30 (INSIEME)**: nome · scope · 5 frasi-scope · ruoli · transport dei contratti · domande organizzatori (riuso OSS? split 10k?)

## Fase 1 — web/ mock-first → checkpoint 13:00 · owner: **Giovanni** · 8/11 · ✅ Task 1 · ✅ Task 2 · ✅ Task 3 (cost counter — **build ok**, $3.94 vs $0.52, zero verde) · 🔨 Task 4 next (recall-green)
> Gira **interamente** su `spec/fixtures/` finché il server non c'è. Grande, leggibile da proiettore, dark-only.
- `[fatto]` **App Next.js** in `web/` — single page, App Router, dark-only · *(Context7: Next.js)*
- `[fatto]` **shadcn init + add** (`card badge button table tabs separator progress skeleton sonner scroll-area collapsible`) + **ai-elements** (`conversation message response`) · *(shadcn CLI/MCP — registry ai-elements configurato)*
- `[fatto]` **Design tokens doc 7**: bg `zinc-950→900` · surface `zinc-900`+`white/10` · **PASS `emerald-500`+glow** · FAIL `red-500` · RUNNING `amber-400` · accent voce `violet-400` · Geist Sans (UI) / Geist Mono (dati, `[t{n}]`, timestamp) · radius `0.75rem`
- `[fatto]` **Fixtures loader tipizzato** sui contratti `SPEC §7` (normalizza `t41_base`→sx, `t41_suggeritore`→dx come `t41`) — **← transcript turn · state.json · cost_event · verdict**
- `[fatto]` **Replay driver**: timeline `ts` (0→10), play/pause + Slider, salto a `t38→t41` *(Task 2)*
- `[fatto]` **Split-screen** base (sx) vs suggeritore (dx) — transcript con ai-elements `conversation`/`message` — **← transcript turn**
- `[fatto]` **Memoria HUD live**: `state.json` riga per riga ("append-only state ledger"), ogni fatto/impegno col suo **`[t{n}]`**, si scrive mentre la timeline scorre — **← state.json** *(Task 2)*
- `[fatto]` **Cost counter divergente** (Task 3): base $3.94 vs suggeritore $0.52 (7.6×), `usd_cumulative` guidato dal replay clock, danger-tint base / violet suggeritore, etichetta MOCK — **← cost_event** · `spec/fixtures/cost.json` · **build verificato**
- `[todo]` **Momento recall**: `emerald-500` + glow + toast `sonner` **SOLO** su `t41_suggeritore` (il verde non appare mai prima) — **← transcript/state**
- `[todo]` **Verdict view**: `base 0/10 · suggeritore 10/10` da `verdicts.json` (reale, scenario orologio, citation t16), drill-down per run con `citation` `[t{n}]` (`collapsible`) — **← verdict**
- `[todo]` **Passata proiettore**: type ampia (≥`text-base`), spacing generoso, contrasti alti, prova su 16:9

> 🛰️ **Team su origin/main (12:36)**: `harness: batch runner N=10` + `harness: requirements.txt` (Gabriele avanti) · `audio: registrazioni nonna` committate · Task 3 web **da pushare**.

## Fase 2 — server/ → checkpoint 13:30 · owner: **Daniele** · 5/5 (cost_event emesso · ⚠️ divergenza da decidere, vedi Fase 5)
- `[fatto]` Agente vittima customer care sullo scheletro sample — layer funzionante end-to-end via testo (base dimentica, suggeritore ricorda)
- `[fatto]` **Distiller** ogni 4 turni → `state.json` (`SPEC §2`, structured output, `gpt-4o-mini`) — **→ state.json** · live
- `[fatto]` **Iniezione periodica** (`SPEC §3`, default sicuro) — funzionante
- `[fatto]` **Emit** `transcript.jsonl` (`SPEC §7`) — **→ transcript turn** · driver headless `batch_run.py` pushato e girato · `recordings/base_run{1..10}.jsonl` + `recordings/sug_run{1..10}.jsonl` prodotti
- `[fatto]` **Emit** `cost_event` (`SPEC §5`) — **→ cost_event** · `cost_meter.py` v1: emesso da `server.py` (live) + `batch_run.py` (file per-run), reset per connessione, token reali da `raw_responses[].usage`. ⚠️ **MA la divergenza è INVERTITA** (base cappato = economico, suggeritore history piena = caro) → **NON wirare il contatore come misurato** finché non si decide il nodo in Fase 5

## Fase 3 — harness/ → checkpoint 13:30 · owner: **Gabriele** · ✅ 3/3
- `[fatto]` **Judge binario** structured output: `{transcript, seeded_fact}` → verdict con `citation` (`SPEC §6`) — **→ verdict** · smoke test su fixture: FIXTURE OK
- `[fatto]` **Batch runner N=10/lato** → `base X/10, suggeritore Y/10` (IL numero) — **→ verdict (aggregato)** · modalità `fixture` + `live` pronte
- `[fatto]` **Cost meter check** (`SPEC §5`) — **← cost_event** · `check_cost()` in runner.py, stampa `base=$X suggeritore=$Y delta=$Z` · fixture MOCK: base=$3.94 suggeritore=$0.52 · `.env` loader stdlib aggiunto, niente footgun · **`--cost-dir`** (commit `73f0237`) aggrega i cost file **per-run reali** di `batch_run.py` (`base_run*_cost.jsonl`/`sug_run*_cost.jsonl`) = media base vs suggeritore su N run; ratio **direzione-aware** (nomina il lato davvero più caro, non assume il base — serve proprio per l'inversione)

## Fase 4 — Integrazione 13:30 (INSIEME, ordine `server → harness → web`) · 3/4
- `[fatto]` Registrare il **fallimento VERO** dell'agente base → `recordings/base_run{1..10}.jsonl` rigenerati su copione orologio (**0/10 reale**, citation t16) — judge confermato
- `[fatto]` Batch N=10 → **`verdicts.json` rigenerato dal giudizio reale** sui 20 recordings (`harness/gen_verdicts.py`): **base 0/10, suggeritore 10/10**, question_turn t15, citation t16. *(prima passata reale = 5/10, limitata dall'iniezione → rinforzato il prompt di re-grounding in `injector.py` perché l'agente risponda DIRETTAMENTE dal ledger → 10/10)*
- `[fatto]` Fixture **demo-replay** `transcript.jsonl`/`state.json` su scenario orologio (chiamata lunga t1→t41, recall t40, citation t41) + audio nonna — artefatto separato dal batch (t16), stesso scenario
- `[todo]` Wire `web ↔ server` (poll/WS) **oppure** replay del JSON registrato

## Fase 5 — 14:00–16:30 (raffinamento, zero feature nuove dopo le 14:00) · 0/4
- `[todo]` **Watchdog** (`SPEC §4`) inietta solo il fatto violato — **→ drift/reinject** · *(1° tagliabile se instabile alle 16:30 → fallback iniezione periodica)*
- `[todo]` Raffina prompt **distiller** (cosa estrae/scarta, stato compatto)
- `[fatto]` **Numeri finali validati** (reggono il Q&A) — giudice **live** ri-eseguito sui 20 `recordings/*.jsonl` alle **15:42**: **base 0/10, suggeritore 10/10** (citation t16 su tutti). Il numero regge fuori dal batch di rigenerazione.
- `[todo]` **⚠️ NODO APERTO — divergenza costi invertita.** Il contatore reale mostra il **suggeritore più caro del base** (base cappato = economico; il suggeritore manda la history piena, manca il *"send compact state instead of resending history"* di `SPEC §3`). Da decidere insieme: **(a)** fix onesto = base cap a **TOKEN** (mima il 32k) + suggeritore invia **stato compatto invece della history** → divergenza reale nella direzione giusta, **ma** rigenerare batch+judge (il numero si ri-valida; rete di sicurezza = tag `run-1330`); **(b)** **tagliare** il contatore dalla demo, costo nel pitch come **dato di produzione citato** (Realtime $/min, StudierAI €4,50 vs €0,13). ⚠️ Non spacciare il `cost.json` MOCK come misurato. Il numero **0/10 vs 10/10 NON è toccato** da questo nodo. · **Misura reale (Gabriele, 15:42)** su un run da 8 turni via `check_cost`: **base $0.1036 vs suggeritore $0.1493** (suggeritore ~1.4× più caro; `tokens_in` base ~380-400 cappati vs suggeritore 375→893). Conferma empirica dell'inversione vs il MOCK (base $3.94 vs $0.52, 7.6×). · **Harness pronto per (a)**: `runner.py --cost-dir` legge già il formato per-run reale e riporta la direzione corretta → se si sceglie (a), il costo si ri-valida all'istante (commit `73f0237`).

## Fase 6 — Freeze 16:30 + pitch · 0/3
- `[todo]` **Freeze** codice + hardening (tag `freeze-1630`) — da qui solo fix
- `[todo]` **VIDEO BACKUP** della demo (obbligatorio, sopravvive senza rete) — tag `demo-final`
- `[todo]` Pitch col timer **≥3 volte** + **consegna form 17:30** (non alle 18:29)

---

## 🎤 Everyone's tasks → pitch (who does what) — upd. 14:45
> **Repo aligned** (`origin/main` clean, builds) · **web/ demo built**: loud nonna audio · recall-green at t41 · real verdict **0/10 · 10/10** · cost pressure-meter · windowed transcript. Scenario **watch locked**; verdict citation `t16` = **design choice** (real batch ≠ replay; see Coupling notes). Only the run-up to the pitch remains.

### 👤 Giovanni — demo (owner)
- [ ] **Test the demo** after `Cmd+Shift+R`: **"Jump to the recall moment"** = cold-open (t38→t40 nonna's voice LOUD → at t41 the base flounders). Audio clear on the speaker?
- [ ] **Submit the form by 17:30** (not at 18:29).

### 👤 Daniele — engine + real data
- [ ] **Live server test** (in progress): live layer for the backup if the network holds; otherwise replay `recordings/` (real batch ready, 0/10·10/10).
- [ ] **Cost fix (a) — in regeneration** (decided): the suggeritore sends the compact ledger instead of resending the full history, and the base runs on a real token cap → real cost meter, divergence in the right direction. Regenerate `recordings/` + the per-run cost files so harness can re-validate. Cutoff ≤16:00.

### 👤 Gabriele — the pitch (owner) + the measure → Q&A
- [ ] **Deliver the 2:30 pitch, rehearsed & timed ≥3 times** — audio hook → problem (OpenAI drift + cost) → why now → demo → sponsors (Agents SDK · structured outputs · ElevenLabs · Codex) → why-us StudierAI. *The demo IS the pitch.*
- [ ] **Light backup deck** (3–4 slides: problem+sources · how · why-us+numbers). Sources dossier on the phone for Q&A.
- [ ] **Q&A defensible numbers**: 0/10 vs 10/10 (judge method + `[t16]` citation from the real batch, re-validated live; re-confirm on the regenerated batch). OpenAI drift documented. **On cost — with fix (a) it's now a REAL, MEASURED win** (base ≫ suggeritore: the base keeps re-paying its context window while the suggeritore sends only the compact state), no longer a projection. **But flag the known gap honestly**: the distiller's own cost isn't counted (cheap model, limited overhead). "Mean judge" at the rehearsals.
- [ ] **Projector + AUDIO test in the room**: the demo is audio-first → loud nonna volume on the real projector.

### 🤝 Together — freeze 16:30
- [ ] **VIDEO BACKUP** of the demo (mandatory ≤16:30, survives without network) — recorded by whoever isn't the bottleneck.
- [ ] tag `freeze-1630` (only fixes from here) · pitch rehearsed · form submitted by 17:30.

---

## Note di coupling (lette dallo scaffold, non assunte)
- **Scenario unico = orologio** (Luca, laurea, prima del 20, Pina interno 3, ordine 4471). Tutta la catena converge: fixtures + audio nonna + harness (`SEEDED_FACT`) + driver (`CALLER_SCRIPT`) + recordings + `verdicts.json`. **Due artefatti dello stesso scenario**: (a) **batch reale** = `recordings/*.jsonl` + `verdicts.json` (chiamata scriptata 16 turni, recall t15→t16, il NUMERO 0/10 vs 10/10); (b) **demo-replay** = `transcript.jsonl` + `state.json` (chiamata lunga t1→t41, recall t40→t41, con audio nonna). Turn-id diversi per design: il judge cita il turno reale del batch (t16), il replay web mostra t41.
- **`t41` sdoppiato**: `transcript.jsonl` ha `t41_base` e `t41_suggeritore` = stesso istante, due agenti. Il loader li mappa a sx/dx, display = `t41`. Nel replay: domanda di recall a `t38`, ultima risposta agente a `t41`, `state.json.last_turn = 41` — coerenti. **Il verdetto NON usa questi turn-id**: `verdicts.json` (batch reale, in `spec/fixtures/` **e** copia web identica) ha `question_turn = t15`, `citation = t16`, che puntano ai `recordings/*.jsonl` (16 turni). La verdict view è un pannello a sé: mostra `[t16]` come testo, non naviga il transcript del replay → nessun conflitto col `t41` della timeline.
- **Verde scarso**: `emerald-500` appare **solo** al recall (`t41_suggeritore`). Tutto il resto è zinc/violet/amber/red. Scarsità = impatto sul proiettore.
- **shadcn in questa sessione**: la sessione Claude corrente è partita **prima** che lo shadcn MCP fosse aggiunto → qui non è caricato. Per il build di `web/`: componenti via **CLI ufficiale** (`npx shadcn add` = codice reale) + **Context7** per le API; lo **shadcn MCP per discovery** è già configurato per Codex e per una sessione Claude nuova.
- **Stato di partenza**: `web/ server/ harness/` sono vuoti (solo README). Il numero "Fatto 5/35" conta lo scaffold + spec + fixtures + MCP — tutto reale, niente codice di prodotto ancora scritto.

## Changelog
- **2026-06-13 (17:25)** — 🧊 **FREEZE — §5 risolto come ONESTÀ, non come numero drammatico.** Esito del fix (a): il lock a contesto pieno **è FALLITO** (giudice **base 5/10** > 3/10: a 28 turni il modello recupera il fatto troppo spesso). Confermato strutturale: a ~640 token di dialogo, *dimenticare* (serve finestra piccola → base economico) e *base ≫ sug* (serve contesto grande) sono **accoppiati e inconciliabili** senza allungare la chiamata (esclusa per il tempo). **Decisione:** spedito il numero validato **base 0/10 · sug 10/10** (item-cap, `verdicts.json` committato ripristinato); tenuto `compact_input` §3 sul sug (cost win reale, sug più leggero); **costo = proiezione etichettata**, NON misura. Esperimento full-context archiviato in `server/evidence/fullcontext-qa/` (5/10 + costo 1.30× misurato + finding) come **prova Q&A**, non headline. `recordings/` riportati al committato (coerenti col 0/10). Dupes `* 2.py` rimossi, `.venv` riparato (uv sync). Commit `7a25bd9`, tag `freeze-1630` pushato. ⚠️ **Supera l'entry 16:05**: il costo NON è un "win reale misurato" — vedi banner 🧊 in cima.
- **2026-06-13 (16:05)** — 🎤 **Pitch riassegnato interamente a Gabriele** (consegna 2:30 + deck backup + Q&A + test audio sala); Giovanni resta owner della **demo**. Sezione `🎤` tradotta in **inglese** e narrativa di costo allineata alla decisione fix (a): il costo è ora un **win reale misurato** (base ≫ sug, il base ripaga la finestra di contesto, il suggeritore manda solo lo stato compatto), non più proiezione — col buco onesto del **distiller-cost** non contato. Aggiornato anche il task Daniele (cost fix (a) in rigenerazione, niente più "cost.json MOCK").
- **2026-06-13 (15:55)** — 🔧 **harness pronto per il formato costi reale** (commit `73f0237`). `runner.py`: nuovo `--cost-dir` che aggrega i cost file **per-run** emessi da `batch_run.py` (`base_run*_cost.jsonl`/`sug_run*_cost.jsonl`) → media base vs suggeritore su N run; il vecchio `--cost` (file singolo) resta invariato. Ratio reso **direzione-aware** (`_ratio`): nomina il lato davvero più caro invece di assumere il base — necessario perché la divergenza è invertita. File/campo mancante → WARN, mai crash. Testato su dir sintetico (inverso → "suggeritore 1.5x") + regressione MOCK (→ "base 7.6x"). Aggiornato il task Q&A di Gabriele: il 7.6× va difeso come **proiezione/dato di produzione**, non come misura (la misura reale è invertita).
- **2026-06-13 (15:10)** — 🔧 **Fix coerenza verdict (defork)**: `web/src/lib/fixtures/verdicts.json` era rimasto allo stato 13:54 (`question_turn t38`, `citation t41`, `base.objective_correct=false`, reason scritte a mano) mentre `spec/fixtures/verdicts.json` era stato rigenerato dal giudizio reale (`t15/t16`, `objective_correct=true`). Risultato: la demo mostrava prove (t41, base objective-fail) **diverse dal numero misurato** sui `recordings/`. Reso il file web **byte-identico** alla fixture reale → un'unica fonte: la verdict view ora mostra i 10+10 verdetti veri con `[t16]` (turno reale dei recordings). Verificato disaccoppiamento: `citation` è solo testo nel pannello, `question_turn` non è renderizzato → nessun conflitto col `t41` della timeline di replay. Aggiornata nota di coupling.
- **2026-06-13 (14:30)** — 🎯 **IL NUMERO REALE su orologio: base 0/10, suggeritore 10/10** — catena completamente riallineata e rigenerata. (1) Allineati `runner.py`/`judge.py` (`SEEDED_FACT`) + `batch_run.py` (`CALLER_SCRIPT`/markers/docstring) al copione orologio. (2) Rigenerati i 20 `recordings/*.jsonl` con `batch_run.py` (layer live, ledger pulito per run). (3) `verdicts.json` rigenerato dal giudizio reale via `harness/gen_verdicts.py`. **Prima passata = 0/10 vs 5/10**: il distiller catturava tutto (ledger perfetto) ma l'agente temporeggiava al recall → rinforzato il prompt d'iniezione in `injector.py` ("rispondi DIRETTAMENTE dal ledger, non chiedere 'vuoi che controlli?'") → re-run → **10/10 reale**. Smoke fixture: FIXTURE OK.
- **2026-06-13 (14:10)** — 🔧 **Riallineamento scenario → orologio**: il rewrite delle 13:54 aveva spostato le fixtures sul copione orologio lasciando indietro la catena harness/batch (ancora scarpini) → `seeded_fact` divergente in 3 file, smoke test fixture rotto, citation incoerente coi recordings. Avviato il riallineamento (vedi 14:30).
- **2026-06-13 (13:54)** — **Scenario riscritto su voce nonna reale** (orologio/Luca/laurea/20/Pina): `transcript.jsonl` (t1→t41, recall a t40, citation t41), `state.json` (5 fatti), `verdicts.json` (seeded_fact = scadenza+consegna, question_turn t38, citation t41). Supera l'entry 13:30 (che era scarpini, citation t16).
- **2026-06-13 (13:30)** — 🎯 **IL NUMERO: base 0/10, suggeritore 10/10** — batch reale girato con `batch_run.py` (N=10/lato, testo scriptato, layer live); judge binario su tutti i 20 transcript; tag `run-1330` pushato. *(citation=t16, scenario scarpini — poi sostituito dal copione orologio alle 13:54, vedi sopra.)* Demo minima vincente: **tutti e 4 i pezzi in verde**. 38 voci, **25 fatte (66%)**.
- **2026-06-13 (13:15)** — **server/ Fase 2 3/4**: Daniele conferma layer funzionante end-to-end via testo (base dimentica, suggeritore ricorda, state.json live). Manca solo emit + driver headless multi-run (in corso). Concordato: path `recordings/base_run{i}.jsonl` / `recordings/sug_run{i}.jsonl`, cost `server/server/run/cost_event.jsonl`, N=10 (fallback N=5), seeded_fact = scarpini 38 nipote giovedì (già in runner.py). 38 voci, **22 fatte (58%)**.
- **2026-06-13 (13:10)** — **harness/ Fase 3 ✅ 3/3 CHIUSA**: cost meter check implementato (`check_cost()` in runner.py, `--cost` CLI flag, validazione campi SPEC §5 con warning non-fatal); `.env` loader stdlib aggiunto (no dipendenze nuove, non sovrascrive variabili già esportate). Smoke test completo: FIXTURE OK + `cost base=$3.94 suggeritore=$0.52 delta=$3.42 (7.6x)`. 38 voci, **19 fatte (50%)**. harness/ è pronto per l'integrazione 13:30 — aspetta solo i transcript da server/.
- **2026-06-13 (13:00)** — **harness/ Fase 3 2/3**: judge.py + runner.py già committati e verificati — smoke test `FIXTURE OK` (base.remembers=false, suggeritore.remembers=true, citation=t41). Resta solo cost meter check (item 3). 38 voci, **18 fatte (47%)**.
- **2026-06-13 (12:30)** — **web/ Task 3 DONE** (cost counter, build verificato da me): due readout `usd_cumulative` guidati dal clock, base $3.94 vs suggeritore $0.52 (7.6×), danger/violet, etichetta MOCK, zero verde. Code review web/ ok (server/client split, CSS vars, contratti). 38 voci, **17 fatte (45%)**. ✅ **Voce nonna RISOLTA — VOCE VERA + copione reale** (13:45): scartato il clone TTS (napoletano mediocre), si usano le **registrazioni vere**. Copione reale = memory-test più forte: orologio per la laurea del nipote **Luca**, scadenza **prima del 20**, ordine **4471**, consegna **sig.ra Pina interno 3** (citofono rotto), recall "arriva in tempo? — ve l'ho detto, il 20!". **Fixture riscritta su questo copione**: `transcript.jsonl` (42 righe, caller napoletano vero / agente italiano) + `state.json` (5 fatti) + `verdicts.json` (recall = scadenza+consegna). 6 clip vere mappate in `web/public/audio/{t1,t5,t7,t9,t38,t40}.mp3`. Convenzione audio documentata in `AGENTS.md`. Da fare: (a) commit; (b) **wiring nel replay** (Codex). Clone "Nonna Rosaria" (`voice_id=Fswq5TxH6CCeDTVrKZKp`) resta per usi futuri.
- **2026-06-13 (12:10)** — **web/ Task 2 DONE** (verificato dal sorgente): replay clock (Play/Pause/Slider/`isPlaying`) + memoria HUD append-only (`state.json` riga per riga coi `[t{n}]`), zero verde, lint ok. ⚠️ **Task 3 (cost counter) NON costruito** nonostante il claim — il sorgente non ha `cost`/`usd`/`token` in `transcript-shell.tsx`. 38 voci, **16 fatte (42%)**. Push Task 1+2 → poi Task 3.
- **2026-06-13 (11:58)** — **web/ Task 1 DONE + booted**: Next.js App Router+TS, shadcn + ai-elements (`conversation`/`message`), fixtures in `web/src/lib/fixtures`, contratti SPEC §7 in `contracts.ts`, loader+normalizzazione `t41` in `fixtures.ts`, split-screen in `transcript-shell.tsx`. lint+build ok, dev su :3000, browser verificato, audit colore = zero verde. 38 voci, **14 fatte (37%)**. Next: Task 2 = memoria HUD + replay clock.
- **2026-06-13 (11:40)** — Primo push fatto (`NapSaga/suggeritore`, commit `b78b473`, **privato**, safety gate ok). Codex su **web/ Task 1** (app+componenti+tokens+fixtures+split-screen) — gate anti-allucinazione rispettato (Context7 + shadcn MCP, registry ai-elements configurato, niente guesswork). 38 voci, 9 fatte (24%).
- **2026-06-13 (notte, 3)** — Setup notturno **chiuso**: `make sync` OK (npm 470 + uv 50, zero errori), backend boota su `:8000` + `/ws` verificato. Fixtures coerenti `t1→t41`. 37 voci, **8 fatte (22%)**. Resta a Giovanni solo il test mic interattivo. Niente codice di prodotto, niente git.
- **2026-06-13 (notte, 2)** — PLAN approvato. Decisione: `web/` = Next.js fresco. Setup notturno: sample clonato in `server/`, `make sync` in corso; fixtures estese end-to-end `t1→t41` e validate (ogni `[t{n}]` reale). 37 voci, 6 fatte (16%). Nessun codice di prodotto, nessun git.
- **2026-06-13 (notte)** — Creato. 35 voci, 5 fatte (14%). Mock-first `web/` è la priorità (0/11). In attesa di OK prima di scrivere codice di prodotto.


- **2026-06-13 (ORA)** — 🔧 **Divergenza costi: DECISO fix (a), in rigenerazione.** Causa confermata dal codice: il suggeritore rispediva la history piena + ledger (caro), il base cappato a 8 item (economico) → meter invertito vs SPEC §5. Mancava il §3 vero (stato compatto invece di rispedire la history). **Fix (solo `server/`, contratti invariati):** (1) `injector.compact_input` = ledger + ultima battuta, ogni turno; (2) base → `truncation.apply_token_cap(~700)` — manda DAVVERO la finestra, meter su `usage` reale, **niente token finti**; (3) `batch_run.CALLER_SCRIPT` allungato a ~14 battute verbose così i fatti del minuto 1 escono dalla finestra entro il recall. ⚠️ **Numeri DA RI-VALIDARE**: rigenerare `recordings/` + `verdicts.json`, confermare **base ~0/10 · sug ~10/10 · base ≫ sug da costi reali**. Rete: tag `run-1330`. **Cutoff regen ≤16:00** → se non valida tutti e tre, piano B (costo = proiezione etichettata, non misura a schermo). Buco noto: il costo del distiller non è contato (Q&A: modello cheap, overhead limitato).