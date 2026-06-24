import { ArrowUpRightIcon, MinusIcon } from "lucide-react";
import type { LongCallFixture } from "@/lib/contracts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/*
 * LONG-CALL EVIDENCE (ROADMAP #3) — the scaling proof behind the live cost meter.
 * The single-screen demo shows ONE short call. This overlay answers the obvious
 * next question — "and on a long call?" — with the measured curve (64 turns, N=5):
 * the full-context base cost CLIMBS while Whisperer stays flat, and the gap WIDENS
 * with length (1.3× at 28 turns → 2.1× at 64 → 7.6× projected). Numbers are
 * measured (recall) / audio-priced (cost); the chart is built from real per-turn
 * cost events. Receipts, no vibes.
 */

function usd(value: number) {
  return `$${value.toFixed(2)}`;
}

function ConfigPanel({
  label,
  recall,
  cost,
  note,
  tone,
}: {
  label: string;
  recall: string;
  cost: number;
  note: string;
  tone: "fail" | "recall" | "muted";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border p-4",
        tone === "fail" && "border-[color:var(--fail)]/45 bg-[color:var(--fail)]/8",
        tone === "recall" &&
          "border-[color:var(--recall)]/60 bg-[color:var(--recall)]/10 shadow-[0_0_36px_var(--recall-glow)]",
        tone === "muted" && "border-black/10 bg-[color:var(--surface-soft)]"
      )}
    >
      <span className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-3xl font-bold tabular-nums leading-none",
            tone === "fail" && "text-[color:var(--fail)]",
            tone === "recall" && "text-[color:var(--recall)]",
            tone === "muted" && "text-muted-foreground"
          )}
        >
          {recall}
        </span>
        <span className="font-mono text-base font-semibold tabular-nums text-foreground">
          {usd(cost)}
        </span>
      </div>
      <span className="text-[0.74rem] leading-4 text-muted-foreground">{note}</span>
    </div>
  );
}

/* ----------------------------------------------------- measured cost-vs-turns chart */

function CostCurve({ longCall }: { longCall: LongCallFixture }) {
  const { curve, headline } = longCall;
  const last = curve[curve.length - 1];
  const minTurn = curve[0].turn;
  const maxTurn = last.turn;
  const maxY = Math.ceil(Math.max(...curve.map((p) => p.baseFull)) / 0.5) * 0.5;

  const VB_W = 780;
  const VB_H = 300;
  const x0 = 52;
  const x1 = VB_W - 86;
  const yTop = 18;
  const yBot = VB_H - 40;

  const sx = (t: number) => x0 + ((t - minTurn) / (maxTurn - minTurn)) * (x1 - x0);
  const sy = (c: number) => yTop + (1 - c / maxY) * (yBot - yTop);

  const key = (k: "baseFull" | "sug" | "baseCapped") =>
    curve.map((p) => `${sx(p.turn).toFixed(1)},${sy(p[k]).toFixed(1)}`).join(" ");
  const areaUnder = (k: "baseFull" | "sug") =>
    `${sx(minTurn).toFixed(1)},${yBot} ${key(k)} ${sx(maxTurn).toFixed(1)},${yBot}`;

  const yGrid = [0, 0.5, 1, 1.5, 2].filter((v) => v <= maxY);
  const xTicks = [16, 32, 48, 64].filter((t) => t <= maxTurn && t >= minTurn);

  const yBF = sy(last.baseFull);
  const ySug = sy(last.sug);
  const xb = x1 + 12;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Costo cumulato su ${maxTurn} turni: base full-context sale a ${usd(
        headline.baseFull.cost
      )}, Whisperer resta a ${usd(headline.suggeritore.cost)} — ${headline.ratio}×.`}
    >
      {/* y gridlines + $ labels */}
      {yGrid.map((v) => (
        <g key={`y${v}`}>
          <line
            x1={x0}
            x2={x1}
            y1={sy(v)}
            y2={sy(v)}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray={v === 0 ? undefined : "2 4"}
          />
          <text
            x={x0 - 8}
            y={sy(v) + 3}
            textAnchor="end"
            className="fill-muted-foreground font-mono"
            fontSize={10}
          >
            {usd(v)}
          </text>
        </g>
      ))}

      {/* x ticks (turns) */}
      {xTicks.map((t) => (
        <text
          key={`x${t}`}
          x={sx(t)}
          y={yBot + 16}
          textAnchor="middle"
          className="fill-muted-foreground font-mono"
          fontSize={10}
        >
          {t}
        </text>
      ))}
      <text
        x={(x0 + x1) / 2}
        y={VB_H - 4}
        textAnchor="middle"
        className="fill-muted-foreground font-mono uppercase"
        fontSize={9}
        letterSpacing={1.5}
      >
        turni della chiamata →
      </text>

      {/* areas */}
      <polygon points={areaUnder("baseFull")} fill="var(--fail)" opacity={0.07} />
      <polygon points={areaUnder("sug")} fill="var(--voice-accent)" opacity={0.07} />

      {/* base capped — cheap but forgets (dashed, muted) */}
      <polyline
        points={key("baseCapped")}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth={1.5}
        strokeDasharray="3 4"
        opacity={0.55}
        strokeLinejoin="round"
      />
      {/* Whisperer — flat */}
      <polyline
        points={key("sug")}
        fill="none"
        stroke="var(--voice-accent)"
        strokeWidth={2.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* base full-context — climbs */}
      <polyline
        points={key("baseFull")}
        fill="none"
        stroke="var(--fail)"
        strokeWidth={2.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* endpoints */}
      <circle cx={sx(maxTurn)} cy={yBF} r={3.5} fill="var(--fail)" />
      <circle cx={sx(maxTurn)} cy={ySug} r={3.5} fill="var(--voice-accent)" />

      {/* cost-gap bracket → the ratio */}
      <line x1={xb} x2={xb} y1={yBF} y2={ySug} stroke="var(--fail)" strokeWidth={1.5} />
      <line x1={xb - 4} x2={xb} y1={yBF} y2={yBF} stroke="var(--fail)" strokeWidth={1.5} />
      <line x1={xb - 4} x2={xb} y1={ySug} y2={ySug} stroke="var(--voice-accent)" strokeWidth={1.5} />
      <text
        x={xb + 5}
        y={(yBF + ySug) / 2 + 4}
        className="fill-[color:var(--fail)] font-mono font-bold"
        fontSize={15}
      >
        {headline.ratio}×
      </text>
    </svg>
  );
}

function LegendDot({ color, dashed }: { color: string; dashed?: boolean }) {
  return dashed ? (
    <span
      className="inline-block h-0 w-3.5 border-t-2 border-dashed"
      style={{ borderColor: color }}
    />
  ) : (
    <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: color }} />
  );
}

/* ------------------------------------------------------------------------- view */

export function LongCallView({ longCall }: { longCall: LongCallFixture }) {
  const { headline, scaling, callTurns, runs, pricingNote } = longCall;

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-black/10 bg-card p-6 shadow-2xl lg:p-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold leading-tight">
            La chiamata lunga — il costo esplode, la memoria no.
          </h2>
          <Badge
            variant="outline"
            className="h-7 shrink-0 rounded-lg border-[color:var(--recall)]/60 px-3 font-mono text-xs text-[color:var(--recall)]"
          >
            {callTurns} turn · N={runs} · misurato
          </Badge>
        </div>
        <p className="max-w-3xl text-base text-muted-foreground">
          La demo mostra una chiamata corta. Su una lunga (64 turn) il base con tutto il
          contesto continua a ripagare la conversazione che cresce; Whisperer ripaga solo
          il ledger. Stesso prompt, stessa voce — diverge solo il layer di memoria.
        </p>
      </div>

      {/* the three configurations */}
      <div className="grid gap-4 sm:grid-cols-3">
        <ConfigPanel
          label="Base · cap"
          recall={headline.baseCapped.recall}
          cost={headline.baseCapped.cost}
          note={headline.baseCapped.note}
          tone="muted"
        />
        <ConfigPanel
          label="Base · full-context"
          recall={headline.baseFull.recall}
          cost={headline.baseFull.cost}
          note={headline.baseFull.note}
          tone="fail"
        />
        <ConfigPanel
          label="Whisperer"
          recall={headline.suggeritore.recall}
          cost={headline.suggeritore.cost}
          note={headline.suggeritore.note}
          tone="recall"
        />
      </div>

      {/* measured cost curve */}
      <div className="rounded-xl border border-black/10 bg-[color:var(--surface-soft)]/60 p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
          <span className="font-mono text-[0.66rem] uppercase tracking-wider text-muted-foreground">
            costo cumulato · per turno · media N={runs}
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.7rem] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <LegendDot color="var(--fail)" /> base full-context
            </span>
            <span className="flex items-center gap-1.5">
              <LegendDot color="var(--voice-accent)" /> Whisperer
            </span>
            <span className="flex items-center gap-1.5">
              <LegendDot color="var(--muted-foreground)" dashed /> base cap (dimentica)
            </span>
          </div>
        </div>
        <CostCurve longCall={longCall} />
      </div>

      {/* scaling — the ratio grows with length */}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[0.66rem] uppercase tracking-wider text-muted-foreground">
          il divario cresce con la durata
        </span>
        <div className="flex flex-wrap items-stretch gap-2">
          {scaling.map((point, i) => (
            <div key={point.turns} className="flex items-stretch gap-2">
              {i > 0 ? (
                <div className="flex items-center text-muted-foreground/60" aria-hidden="true">
                  <ArrowUpRightIcon className="size-4" />
                </div>
              ) : null}
              <div
                className={cn(
                  "flex min-w-[8.5rem] flex-col gap-0.5 rounded-lg border px-3 py-2",
                  point.kind === "proiettato"
                    ? "border-dashed border-[color:var(--fail)]/40 bg-[color:var(--fail)]/[0.04]"
                    : "border-black/10 bg-[color:var(--surface-soft)]"
                )}
              >
                <span
                  className={cn(
                    "font-mono text-2xl font-bold tabular-nums leading-none",
                    point.kind === "proiettato"
                      ? "text-[color:var(--fail)]"
                      : "text-foreground"
                  )}
                >
                  {point.ratio}×
                </span>
                <span className="font-mono text-[0.7rem] text-muted-foreground">
                  {point.turns} turn
                </span>
                <span className="text-[0.66rem] uppercase tracking-wide text-muted-foreground/80">
                  {point.kind}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* honest note — anti-bluff */}
      <div className="flex items-start gap-2 rounded-lg border border-black/10 bg-[color:var(--surface-soft)] px-4 py-3">
        <MinusIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-[0.82rem] leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">Nota onesta:</span> dimenticare e
          costare sono accoppiati. Il base <span className="font-medium">cappato</span> è
          economico ma perde il fatto del minuto uno ({headline.baseCapped.recall}). Il base{" "}
          <span className="font-medium">full-context</span> ricorda quasi tutto (
          {headline.baseFull.recall}, con context rot) ma costa{" "}
          <span className="font-medium text-[color:var(--fail)]">{headline.ratio}×</span> il
          suggeritore. Whisperer ricorda {headline.suggeritore.recall}{" "}
          <span className="font-medium text-[color:var(--recall)]">e</span> resta piatto.
          <span className="ml-1 font-mono text-[0.72rem]">· {pricingNote}</span>
        </p>
      </div>
    </section>
  );
}
