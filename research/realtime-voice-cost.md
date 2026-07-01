# Realtime voice — il memory layer (Whisperer) riduce il costo? — caso StudierAI

**Domanda:** il memory layer di Whisperer (session-rotation + ledger, SPEC §3) fa
pagare **di meno** una lezione vocale realtime da 10–15 min? Caso reale: il tutor
orale di StudierAI (`openai_realtime_handler.py` → `gpt-realtime-mini`).

**Risposta netta: no, non sul costo within-call.** Converge da due lati indipendenti.
Il valore del memory layer resta **recall pieno, latenza, memoria cross-sessione,
niente context-rot** — non il prezzo della singola lezione.

---

## 1. Il costo di una lezione realtime è dominato dall'I/O audio, non dal contesto

In tutte le API realtime il costo grosso è l'audio che scorre (studente che parla +
tutor che parla). Quello è **identico** con o senza memory layer: la conversazione
è la stessa. Il memory layer agisce solo sulla fetta "contesto ri-trasmesso", che è
già piccola (o gratis) — vedi sotto per provider.

## 2. Per provider

| Provider realtime | Modello di costo | Il memory layer risparmia? |
|---|---|---|
| **OpenAI Realtime** (`gpt-realtime-mini`, StudierAI oggi) | a token, **caching automatico** sul prefisso | **poco** — ~10–13% a 15 min; il caching (audio cached $0.30/M vs $10/M) schiaccia già il contesto ripetuto |
| **Grok Voice** (`grok-voice-latest`) | **$0.05/min flat ($3/ora), a tempo** | **niente** — paghi i minuti, i token non contano |

### OpenAI `gpt-realtime-mini` (token-based)
Prezzi (USD/1M): audio in **$10** (cached **$0.30**), audio out **$20**; testo in
$0.60 (cached $0.06), out $2.40. Encoding: utente 600 tok/min, assistente 1200 tok/min.
Modello 15 min (studente ~6 min / tutor ~5 min, ~30 turni, doc ~2900 tok in instructions):

- floor audio I/O (inevitabile, uguale ovunque): **~$0.16–0.25**
- base full-context **con caching**: **~$0.30** → suggeritore ~$0.26 → **risparmio ~13%**
- base full-context **senza caching**: ~$1.6 → suggeritore ~$0.31 → risparmio ~80%
  (ma il caching OpenAI è automatico e di default sopra i 1024 token: lo scenario
  reale è "con caching")

Il risparmio cresce solo su chiamate lunghe (30–60 min) o se il caching non regge.

### Grok Voice (time-based)
$0.05/min flat → **15 min = $0.75**, **10 min = $0.50**. Essendo a tempo, ridurre i
token (ciò che fa il memory layer) **non cambia il conto**. Fonti: vedi sotto.

## 3. Bonus decisionale — Grok è più semplice ma più caro per lezione

- OpenAI `gpt-realtime-mini`, 15 min, con caching: **~$0.20–0.30** (modellato)
- Grok Voice, 15 min: **$0.75** (flat)

→ Passare a Grok = pricing prevedibile e migrazione più semplice (compatibile con la
spec OpenAI Realtime, basta cambiare base URL a `wss://api.x.ai/v1/realtime`), **ma
~2.5–3× più caro per lezione** rispetto a OpenAI mini. Grok conviene se conta la
prevedibilità/latency o su chiamate dove il caching OpenAI non regge.

## 4. Cosa NON è ancora misurato (onestà)

- I numeri OpenAI sono **modellati**, non misurati live: il test reale è bloccato
  perché entrambe le chiavi OpenAI disponibili sono `insufficient_quota`, e non c'è
  una `XAI_API_KEY` per testare Grok. Strumento pronto: `harness/measure_realtime_cost.py`
  (`REALTIME_PROVIDER=xai|openai`) — dà tokens reali + **cache-hit %** appena c'è una
  chiave con credito. Il meter è `sdk/whisperer/realtime_cost_meter.py`.
- La cache-hit reale di OpenAI sulla lezione conferma/smentisce il "~13%".

## 5. Nota collaterale urgente (repo StudierAI, non questo)

L'handler realtime di StudierAI usa la shape **Beta** dismessa da OpenAI
(`beta_api_shape_disabled`, verificato live). Va migrato alla shape **GA**
(via header `OpenAI-Beta`; `session.type:"realtime"`, `output_modalities`,
`audio.input/output`). La shape GA corretta è documentata in
`harness/measure_realtime_cost.py`. Indipendente dalla questione costo.

---

### Fonti
- OpenAI Realtime pricing/costi: developers.openai.com/api/docs/pricing ·
  developers.openai.com/api/docs/guides/realtime-costs ·
  eesel.ai/blog/gpt-realtime-mini-pricing
- Grok Voice $0.05/min: x.ai/news/grok-voice-agent-api ·
  medium.com/@CherryZhouTech (xAI Voice a $0.05/min) · aicostcheck.com/provider/xai
- Compatibilità OpenAI-Realtime + endpoint: docs.x.ai/docs/guides/voice
