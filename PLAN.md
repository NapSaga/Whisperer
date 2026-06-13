# PLAN.md — Il Suggeritore · cruscotto vivo del build

> Coupling: `AGENTS.md` + `spec/SPEC.md §7` + `spec/fixtures/`. Non si reinventa nulla:
> ciò che non è nello scaffold non si fa. Questo file si aggiorna **durante** il lavoro —
> deve dire a colpo d'occhio quanto sta e quanto manca.

## Avanzamento — Fatto 16 / Totale 38 (42%)
```
████████░░░░░░░░░░░░  42%
```
Fase mock-first (web/ su fixtures entro 13:00) è la priorità: 0/11.
Stanotte: setup sample + fixtures coerenti (no codice di prodotto, no git).

## Legenda
`[fatto]` · `[in corso]` · `[todo]` — owner: **server=Daniele · harness=Gabriele · web=Giovanni** —
contratto = oggetto di `SPEC §7` che la voce **produce →** o **consuma ←**.

## 🏁 Demo minima vincente (il pavimento — se alle 16:30 ci sono questi 4, la demo esiste)
1. `[todo]` base dimentica (registrato, vero) · 2. `[todo]` suggeritore ricorda (live) ·
3. `[todo]` split-screen · 4. `[todo]` memoria HUD che si scrive da sola.
Ordine di taglio se in ritardo: **watchdog → cost counter → drill-down judge**. Mai tagliare: **il numero del judge**.

## 🔒 Regole vincolanti (anti-allucinazione + disciplina)
- Ogni API di libreria (Next.js, Tailwind, ai-elements, OpenAI Agents SDK, ElevenLabs) → **Context7 MCP**, mai a memoria.
- Ogni componente UI → **shadcn** (CLI ufficiale `npx shadcn add …` = codice reale; MCP shadcn per discovery). Niente primitive scritte a mano, niente API inventate.
- Se manca doc o componente → **stop**, lo segnalo. Non si improvvisa.
- Solo contro i contratti `SPEC §7` e `spec/fixtures/`. Un task chiuso alla volta, sessione nuova per task, zero refactor non richiesti.
- I numeri nelle fixtures (verdicts **2/10 vs 9/10**) sono **MOCK** per far girare la UI → mai presentati come misurati. Il numero vero arriva dal run delle **13:30**.
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

## Fase 1 — web/ mock-first → checkpoint 13:00 · owner: **Giovanni** · 7/11 · ✅ Task 1 (app·componenti·tokens·fixtures·split-screen) · ✅ Task 2 (replay clock + memoria HUD, zero verde, lint ok) · 🔨 Task 3 next (**cost counter — NON ancora costruito**)
> Gira **interamente** su `spec/fixtures/` finché il server non c'è. Grande, leggibile da proiettore, dark-only.
- `[fatto]` **App Next.js** in `web/` — single page, App Router, dark-only · *(Context7: Next.js)*
- `[fatto]` **shadcn init + add** (`card badge button table tabs separator progress skeleton sonner scroll-area collapsible`) + **ai-elements** (`conversation message response`) · *(shadcn CLI/MCP — registry ai-elements configurato)*
- `[fatto]` **Design tokens doc 7**: bg `zinc-950→900` · surface `zinc-900`+`white/10` · **PASS `emerald-500`+glow** · FAIL `red-500` · RUNNING `amber-400` · accent voce `violet-400` · Geist Sans (UI) / Geist Mono (dati, `[t{n}]`, timestamp) · radius `0.75rem`
- `[fatto]` **Fixtures loader tipizzato** sui contratti `SPEC §7` (normalizza `t41_base`→sx, `t41_suggeritore`→dx come `t41`) — **← transcript turn · state.json · cost_event · verdict**
- `[fatto]` **Replay driver**: timeline `ts` (0→10), play/pause + Slider, salto a `t38→t41` *(Task 2)*
- `[fatto]` **Split-screen** base (sx) vs suggeritore (dx) — transcript con ai-elements `conversation`/`message` — **← transcript turn**
- `[fatto]` **Memoria HUD live**: `state.json` riga per riga ("append-only state ledger"), ogni fatto/impegno col suo **`[t{n}]`**, si scrive mentre la timeline scorre — **← state.json** *(Task 2)*
- `[todo]` **Cost counter divergente** (Task 3): base sale ripido, suggeritore quasi piatto, `usd_cumulative` a schermo — **← cost_event** · fixture pronta: `spec/fixtures/cost.json` (22 eventi, $3.94 vs $0.52, MOCK)
- `[todo]` **Momento recall**: `emerald-500` + glow + toast `sonner` **SOLO** su `t41_suggeritore` (il verde non appare mai prima) — **← transcript/state**
- `[todo]` **Verdict view**: `base 2/10 · suggeritore 9/10` da `verdicts.json`, **etichetta "MOCK — numero reale alle 13:30"**, drill-down per run con `citation` `[t{n}]` (`collapsible`) — **← verdict**
- `[todo]` **Passata proiettore**: type ampia (≥`text-base`), spacing generoso, contrasti alti, prova su 16:9

## Fase 2 — server/ → checkpoint 13:30 · owner: **Daniele** · 0/4
- `[todo]` Agente vittima customer care sullo scheletro sample
- `[todo]` **Distiller** ogni 4 turni → `state.json` (`SPEC §2`, structured output, `gpt-4o-mini`) — **→ state.json**
- `[todo]` **Iniezione periodica** (`SPEC §3`, default sicuro)
- `[todo]` **Emit** `transcript.jsonl` + `cost_event` (`SPEC §5,§7`) — **→ transcript turn · cost_event**

## Fase 3 — harness/ → checkpoint 13:30 · owner: **Gabriele** · 0/3
- `[todo]` **Judge binario** structured output: `{transcript, seeded_fact}` → verdict con `citation` (`SPEC §6`) — **→ verdict**
- `[todo]` **Batch runner N=10/lato** → `base X/10, suggeritore Y/10` (IL numero) — **→ verdict (aggregato)**
- `[todo]` **Cost meter check** (`SPEC §5`) — **← cost_event**

## Fase 4 — Integrazione 13:30 (INSIEME, ordine `server → harness → web`) · 0/3
- `[todo]` Registrare il **fallimento VERO** dell'agente base → replay (`SPEC §8`) — **← transcript**
- `[todo]` Primo run lungo + batch N=10 → **IL NUMERO vero** (sostituisce il mock in `verdicts.json`) — tag `run-1330`
- `[todo]` Wire `web ↔ server` (poll/WS) **oppure** replay del JSON registrato

## Fase 5 — 14:00–16:30 (raffinamento, zero feature nuove dopo le 14:00) · 0/4
- `[todo]` **Watchdog** (`SPEC §4`) inietta solo il fatto violato — **→ drift/reinject** · *(1° tagliabile se instabile alle 16:30 → fallback iniezione periodica)*
- `[todo]` Raffina prompt **distiller** (cosa estrae/scarta, stato compatto)
- `[todo]` **Numeri finali validati** (reggono il Q&A)
- `[todo]` Cost counter **live** collegato a schermo

## Fase 6 — Freeze 16:30 + pitch · 0/3
- `[todo]` **Freeze** codice + hardening (tag `freeze-1630`) — da qui solo fix
- `[todo]` **VIDEO BACKUP** della demo (obbligatorio, sopravvive senza rete) — tag `demo-final`
- `[todo]` Pitch col timer **≥3 volte** + **consegna form 17:30** (non alle 18:29)

---

## Note di coupling (lette dallo scaffold, non assunte)
- **`t41` sdoppiato**: `transcript.jsonl` ha `t41_base` e `t41_suggeritore` = stesso istante, due agenti. Il loader li mappa a sx/dx, display = `t41`. `verdicts.json.question_turn = t38`, `citation = t41`, `state.json.last_turn = 41` — coerenti.
- **Verde scarso**: `emerald-500` appare **solo** al recall (`t41_suggeritore`). Tutto il resto è zinc/violet/amber/red. Scarsità = impatto sul proiettore.
- **shadcn in questa sessione**: la sessione Claude corrente è partita **prima** che lo shadcn MCP fosse aggiunto → qui non è caricato. Per il build di `web/`: componenti via **CLI ufficiale** (`npx shadcn add` = codice reale) + **Context7** per le API; lo **shadcn MCP per discovery** è già configurato per Codex e per una sessione Claude nuova.
- **Stato di partenza**: `web/ server/ harness/` sono vuoti (solo README). Il numero "Fatto 5/35" conta lo scaffold + spec + fixtures + MCP — tutto reale, niente codice di prodotto ancora scritto.

## Changelog
- **2026-06-13 (12:10)** — **web/ Task 2 DONE** (verificato dal sorgente): replay clock (Play/Pause/Slider/`isPlaying`) + memoria HUD append-only (`state.json` riga per riga coi `[t{n}]`), zero verde, lint ok. ⚠️ **Task 3 (cost counter) NON costruito** nonostante il claim — il sorgente non ha `cost`/`usd`/`token` in `transcript-shell.tsx`. 38 voci, **16 fatte (42%)**. Push Task 1+2 → poi Task 3.
- **2026-06-13 (11:58)** — **web/ Task 1 DONE + booted**: Next.js App Router+TS, shadcn + ai-elements (`conversation`/`message`), fixtures in `web/src/lib/fixtures`, contratti SPEC §7 in `contracts.ts`, loader+normalizzazione `t41` in `fixtures.ts`, split-screen in `transcript-shell.tsx`. lint+build ok, dev su :3000, browser verificato, audit colore = zero verde. 38 voci, **14 fatte (37%)**. Next: Task 2 = memoria HUD + replay clock.
- **2026-06-13 (11:40)** — Primo push fatto (`NapSaga/suggeritore`, commit `b78b473`, **privato**, safety gate ok). Codex su **web/ Task 1** (app+componenti+tokens+fixtures+split-screen) — gate anti-allucinazione rispettato (Context7 + shadcn MCP, registry ai-elements configurato, niente guesswork). 38 voci, 9 fatte (24%).
- **2026-06-13 (notte, 3)** — Setup notturno **chiuso**: `make sync` OK (npm 470 + uv 50, zero errori), backend boota su `:8000` + `/ws` verificato. Fixtures coerenti `t1→t41`. 37 voci, **8 fatte (22%)**. Resta a Giovanni solo il test mic interattivo. Niente codice di prodotto, niente git.
- **2026-06-13 (notte, 2)** — PLAN approvato. Decisione: `web/` = Next.js fresco. Setup notturno: sample clonato in `server/`, `make sync` in corso; fixtures estese end-to-end `t1→t41` e validate (ogni `[t{n}]` reale). 37 voci, 6 fatte (16%). Nessun codice di prodotto, nessun git.
- **2026-06-13 (notte)** — Creato. 35 voci, 5 fatte (14%). Mock-first `web/` è la priorità (0/11). In attesa di OK prima di scrivere codice di prodotto.
