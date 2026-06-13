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
