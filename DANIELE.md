# Cosa mi serve da Daniele per l'integrazione 13:30

## 1. Path dei transcript su disco
Dove scrive i file `.jsonl` per ogni run — base e suggeritore separati.

Esempio atteso:
```
recordings/base_run1.jsonl
recordings/base_run2.jsonl
...
recordings/sug_run1.jsonl
recordings/sug_run2.jsonl
```

Mi serve per lanciare:
```
python harness/runner.py --mode live \
  --base recordings/base_run1.jsonl ... \
  --sug  recordings/sug_run1.jsonl ...
```

## 2. Emette cost.json / stream di cost_event?
Se sì: path del file → passo `--cost <path>` al runner, stampa il delta automaticamente.
Se no: uso la fixture mock, nessun problema.

Shape atteso (SPEC §5):
```json
{ "agent": "base", "turn": "t10", "tokens_in": 4200, "tokens_out": 180, "usd_cumulative": 1.84 }
```

## 3. Quanti run riesce a fare entro le 13:30?
Il runner accetta qualsiasi N — base e sug devono avere lo stesso numero di file.
Se meno di 10, concordiamo N adesso e lo diciamo nella slide ("base X/N").

---

# Risposte di Daniele — aggiornate live

> Stato al 12:55. Layer funzionante end-to-end via TESTO: base dimentica (cap), suggeritore
> ricorda (distiller → `state.json` → iniezione). `state.json` è GIÀ live. Mancano emit transcript/cost
> e il driver multi-run (in corso). Aggiorno questa sezione mano a mano.

## R1 — Path dei transcript
- **Oggi:** il server scrive **un solo** `server/server/run/transcript.jsonl` per sessione.
  Shape già conforme a SPEC §7: `{ "turn", "role": "caller"|"agent", "text", "ts" }` (mappo user→caller, assistant→agent).
- **Per i tuoi N file separati** (`base_run{i}.jsonl` / `sug_run{i}.jsonl`) serve un **driver headless**
  che giri l'agente N volte sullo stesso copione e salvi un file per run. Lo costruisco io in `server/`
  (gira il `Workflow` senza websocket, prende `mode` + copione + output path).
- **CONCORDATO ✓:** cartella `recordings/` in root, naming `recordings/base_run{i}.jsonl` /
  `recordings/sug_run{i}.jsonl`. Le produce il driver headless (in costruzione).

## R2 — cost_event
- **Sì, lo emetto.** File `server/server/run/cost_event.jsonl`, una riga per evento, shape SPEC §5
  (`agent, turn, tokens_in, tokens_out, usd_cumulative`). Token **reali** da `result.raw_responses[].usage`.
  È nello stesso commit dell'emit (in arrivo a breve).
- **Fino ad allora:** usa pure la fixture mock `spec/fixtures/cost.json`, nessun problema.
- Nota onestà: il contatore mostra la **divergenza di contesto ritrasmesso** (token testo), i prezzi
  audio Realtime sono costanti citate, non il costo letterale di questa demo. Tienilo presente nella slide.

## R3 — Quanti run entro le 13:30
- I run del batch sono **testo scriptato** (veloci, niente audio/STT), quindi una volta pronto il driver
  **N=10 per lato è fattibile**. Puntiamo a **N=10**.
- **CONCORDATO ✓:** puntiamo **N=10**; fallback **N=5** se i tempi stringono, slide "base X/5".
- **CONCORDATO ✓ — scenario batch:** copione fisso sui fatti dei fixtures — *scarpini numero 38, regalo
  per il nipote, consegna giovedì* → questo è il `seeded_fact` del judge. La voce della nonna napoletana
  resta per il run-demo singolo, non per il batch.
