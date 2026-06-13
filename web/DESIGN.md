# Il Suggeritore — Design System

> Tabellone delle prove, **light premium editorial**. Definito, non vibe-code.
> Single screen, light-mode, projector-first (16:9). Tokens in `src/app/globals.css`.

## Principio
Una sola schermata, zero scroll di pagina. La storia è una scena:
**stessa chiamata → uno dimentica, uno ricorda → il numero esplode al recall.**
Ogni affermazione porta la sua citazione `[tN]` = ricevute, non vibes.

## Colore (light, semantica non decorazione)
| Token | Uso | Valore (oklch ≈ hex) |
|---|---|---|
| `--background` | off-white morbido + radiale | `0.984 0.002 250` ≈ #FAFBFC |
| `--card` / `--surface-strong` | pannelli bianchi (shadow-sm) | `1 0 0` = #FFFFFF |
| `--surface-soft` | mini-pannelli interni, grigio chiaro | `0.965 0.003 250` ≈ #F2F3F5 |
| `--foreground` | testo near-black | `0.21 0.012 264` ≈ #1A1B1E |
| `--muted-foreground` | testo secondario (≥4.5:1 su bianco) | `0.5 0.02 262` ≈ #6B7180 |
| `--border` / hairline | `border-black/10` | `0.9 0.004 255` ≈ #E4E5E8 |
| `--fail` (base) | rosso — chi dimentica = il problema | `0.585 0.22 27` ≈ #DC2626 |
| `--recall` (sugg.) | emerald — la soluzione, SCARSO | `0.6 0.135 162` ≈ #059669 |
| `--voice-accent` | indigo profondo — memoria / voce nonna | `0.48 0.13 264` ≈ #3F46A8 |
| `--running` | amber — live | `0.62 0.16 58` ≈ #C2700A |

**Regola dello scarso**: l'emerald compare SOLO al recall (t41) e sulle due prove
citate (`f3`, `f5`). Base resta neutro fino al recall, poi rosso → niente spoiler.

## Tipografia
- **Geist Sans** — tutta la UI. **Geist Mono** — solo dati: timestamp, `[tN]`, `$`, score (`tabular-nums`).
- Scala lean: titolo `text-2xl/3xl`, lane header `text-base`, bolle `0.88rem`, dati `0.6–0.72rem`, numero verdetto `text-3xl`.

## Pattern (premium light)
- **Card bianche su off-white**, **shadow-sm** per l'elevazione (non glow), bordo hairline `border-black/10`, radius sobrio.
- **Bolla agente** = bianca con bordo; **bolla Nonna** = grigio chiaro (`--secondary`), a destra.
- **Glow colorato** solo come prova: alone soft emerald sulla card vincente al recall (ombra direzionale, non halo da neon).
- **`[tN]` citation chip** = motivo ricorrente (la prova). Scrim modale scuro (`bg-black/75`) per l'overlay prove.

## Layout (una schermata `h-dvh`, no scroll pagina)
```
top strip    brand + costo (stima)                      shrink-0
titolo       "Uno dimentica, uno ricorda."              shrink-0
replay bar   Vai al recall · Dall'inizio · ⏯ · 🔊       shrink-0
STAGE        base | suggeritore | memoria viva          flex-1, scroll interno
verdetto     teaser → ESPLODE al recall (0/10 vs 10/10) shrink-0
```
Solo i corpi dei pannelli scrollano internamente. Prove (20 run) in **overlay**, mai sotto la piega.

## Voce / movimento
- **Karaoke live caption**: il testo della Nonna appare parola-per-parola guidato dal `currentTime` reale dell'audio, **senza anteprima** delle parole future (solo il detto + cursore). Si congela in pausa, riprende dalla stessa parola.
- **Avanzamento**: % grande + fase (`ascolto` / `avanti veloce 2×` / `recall`). Da consegna (t9) a test-memoria (t38) il replay va a **2×**.
- Clip audio: clock congelato + "Nonna sta parlando…" → freeze intenzionale.
- `prefers-reduced-motion`: stati finali restano, si ferma solo il moto.

## Verità (anti-bluff)
- Costo = **stima** (pricing OpenAI Realtime). Verdetto = **misurato**, run-1330, N=10/lato.
