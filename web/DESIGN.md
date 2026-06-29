# Whisperer — Design System

> Evidence board, **light premium editorial**. Deliberate, not vibe-coded.
> Single screen, light-mode, projector-first (16:9). Tokens in `src/app/globals.css`.

## Principle
A single screen, zero page scroll. The story is one scene:
**same call → one forgets, one remembers → the number explodes at recall.**
Every claim carries its `[tN]` citation = receipts, not vibes.

## Color (light, semantic not decorative)
| Token | Use | Value (oklch ≈ hex) |
|---|---|---|
| `--background` | soft off-white + radial | `0.984 0.002 250` ≈ #FAFBFC |
| `--card` / `--surface-strong` | white panels (shadow-sm) | `1 0 0` = #FFFFFF |
| `--surface-soft` | inner mini-panels, light gray | `0.965 0.003 250` ≈ #F2F3F5 |
| `--foreground` | near-black text | `0.21 0.012 264` ≈ #1A1B1E |
| `--muted-foreground` | secondary text (≥4.5:1 on white) | `0.5 0.02 262` ≈ #6B7180 |
| `--border` / hairline | `border-black/10` | `0.9 0.004 255` ≈ #E4E5E8 |
| `--fail` (base) | red — the one who forgets = the problem | `0.585 0.22 27` ≈ #DC2626 |
| `--recall` (sugg.) | emerald — the solution, SCARCE | `0.6 0.135 162` ≈ #059669 |
| `--voice-accent` | deep indigo — memory / grandmother's voice | `0.48 0.13 264` ≈ #3F46A8 |
| `--running` | amber — live | `0.62 0.16 58` ≈ #C2700A |

**Scarcity rule**: emerald appears ONLY at recall (t41) and on the two cited
proofs (`f3`, `f5`). Base stays neutral until recall, then red → no spoilers.

## Typography
- **Geist Sans** — all the UI. **Geist Mono** — data only: timestamps, `[tN]`, `$`, score (`tabular-nums`).
- Lean scale: title `text-2xl/3xl`, lane header `text-base`, bubbles `0.88rem`, data `0.6–0.72rem`, verdict number `text-3xl`.

## Patterns (premium light)
- **White cards on off-white**, **shadow-sm** for elevation (not glow), hairline border `border-black/10`, sober radius.
- **Agent bubble** = white with border; **Grandmother bubble** = light gray (`--secondary`), right-aligned.
- **Colored glow** only as proof: soft emerald halo on the winning card at recall (directional shadow, not a neon halo).
- **`[tN]` citation chip** = recurring motif (the proof). Dark modal scrim (`bg-black/75`) for the proof overlay.

## Layout (a single `h-dvh` screen, no page scroll)
```
top strip    brand + cost (estimate)                    shrink-0
title        "One forgets, one remembers."              shrink-0
replay bar   Jump to recall · From the start · ⏯ · 🔊   shrink-0
STAGE        base | suggeritore | live memory           flex-1, inner scroll
verdict      teaser → EXPLODES at recall (0/10 vs 10/10) shrink-0
```
Only the panel bodies scroll internally. Proofs (20 runs) in an **overlay**, never below the fold.

## Voice / motion
- **Karaoke live caption**: the Grandmother's text appears word-by-word driven by the audio's real `currentTime`, **without previewing** future words (only what's said + cursor). It freezes on pause, resumes from the same word.
- **Progress**: large % + phase (`listening` / `fast-forward 2×` / `recall`). From delivery (t9) to memory-test (t38) the replay runs at **2×**.
- Audio clip: frozen clock + "Grandmother is speaking…" → intentional freeze.
- `prefers-reduced-motion`: final states remain, only the motion stops.

## Truth (anti-bluff)
- Cost = **estimate** (OpenAI Realtime pricing). Verdict = **measured**, run-1330, N=10/side.
