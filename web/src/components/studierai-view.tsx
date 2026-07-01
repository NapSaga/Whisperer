import Link from "next/link";
import { ArrowLeftIcon, CheckIcon, MinusIcon, XIcon } from "lucide-react";
import type { LongCallCurvePoint, StudieraiFixture } from "@/lib/contracts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/*
 * StudierAI · esame orale — la demo reale configurata, MISURATA (ROADMAP #4).
 * Customer-zero vero: lo stack oral-exam di StudierAI (esaminatore su gpt-realtime-mini,
 * 45 min, contesto pieno lato Realtime) con Whisperer sotto. Numeri misurati su una
 * sessione ~14 min (64 turni, N=3); il costo è prezzato alla lente Realtime audio
 * ($32/$64 per M) = il modello di costo reale di StudierAI. Receipts, no vibes.
 */

function usd(value: number) {
  return `$${value.toFixed(2)}`;
}

/* ----------------------------------------------------- measured cost-vs-turns chart */

function CostCurve({ curve, ratio }: { curve: LongCallCurvePoint[]; ratio: number }) {
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
        last.baseFull
      )}, Whisperer resta a ${usd(last.sug)} — ${ratio}×.`}
    >
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
        turni della sessione →
      </text>

      <polygon points={areaUnder("baseFull")} fill="var(--fail)" opacity={0.07} />
      <polygon points={areaUnder("sug")} fill="var(--voice-accent)" opacity={0.07} />

      <polyline
        points={key("baseCapped")}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth={1.5}
        strokeDasharray="3 4"
        opacity={0.55}
        strokeLinejoin="round"
      />
      <polyline
        points={key("sug")}
        fill="none"
        stroke="var(--voice-accent)"
        strokeWidth={2.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polyline
        points={key("baseFull")}
        fill="none"
        stroke="var(--fail)"
        strokeWidth={2.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <circle cx={sx(maxTurn)} cy={yBF} r={3.5} fill="var(--fail)" />
      <circle cx={sx(maxTurn)} cy={ySug} r={3.5} fill="var(--voice-accent)" />

      <line x1={xb} x2={xb} y1={yBF} y2={ySug} stroke="var(--fail)" strokeWidth={1.5} />
      <line x1={xb - 4} x2={xb} y1={yBF} y2={yBF} stroke="var(--fail)" strokeWidth={1.5} />
      <line x1={xb - 4} x2={xb} y1={ySug} y2={ySug} stroke="var(--voice-accent)" strokeWidth={1.5} />
      <text
        x={xb + 5}
        y={(yBF + ySug) / 2 + 4}
        className="fill-[color:var(--fail)] font-mono font-bold"
        fontSize={15}
      >
        {ratio}×
      </text>
    </svg>
  );
}

/* ---------------------------------------------------------------- result panels */

function ResultPanel({
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
  const [num, den] = recall.split("/");
  const remembers = num === den && num !== "0";
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-5",
        tone === "fail" && "border-[color:var(--fail)]/45 bg-[color:var(--fail)]/8",
        tone === "recall" &&
          "border-[color:var(--recall)]/60 bg-[color:var(--recall)]/10 shadow-[0_0_36px_var(--recall-glow)]",
        tone === "muted" && "border-black/10 bg-[color:var(--surface-soft)]"
      )}
    >
      <span className="text-[0.74rem] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline gap-3">
        <span className="flex items-center gap-1 font-mono text-3xl font-bold tabular-nums leading-none text-foreground">
          {remembers ? (
            <CheckIcon className="size-5 text-[color:var(--recall)]" />
          ) : (
            <XIcon className="size-5 text-[color:var(--fail)]" />
          )}
          {recall}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-mono text-2xl font-semibold tabular-nums",
            tone === "fail" && "text-[color:var(--fail)]",
            tone === "recall" && "text-[color:var(--recall)]",
            tone === "muted" && "text-muted-foreground"
          )}
        >
          {usd(cost)}
        </span>
        <span className="text-[0.7rem] text-muted-foreground">/ sessione</span>
      </div>
      <span className="text-[0.78rem] leading-5 text-muted-foreground">{note}</span>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-black/10 bg-[color:var(--surface-soft)] px-3 py-2">
      <span className="font-mono text-[0.62rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[0.82rem] font-medium text-foreground">{value}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- view */

export function StudieraiView({ data }: { data: StudieraiFixture }) {
  const { config, headline, subject, runs, callTurns, sessionMinutes } = data;

  const configRows: { label: string; value: string }[] = [
    { label: "Modello (prod)", value: config.modelProd },
    { label: "Modello (harness)", value: config.modelHarness },
    { label: "Profilo agente", value: config.agentProfile },
    { label: "Scenario", value: config.scenario },
    { label: "Voce (STT / TTS)", value: `${config.stt} / ${config.tts}` },
    { label: "Base context cap", value: `${config.baseCap} turni` },
    { label: "Lente costo", value: config.costLens },
    { label: "Sessione", value: `~${sessionMinutes} min · ${callTurns} turni · N=${runs}` },
    { label: "Materia", value: subject },
    { label: "Fonte", value: config.source },
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 p-6 lg:p-10">
      {/* header */}
      <header className="flex flex-col gap-3">
        <Link
          href="/"
          className="flex w-fit items-center gap-1.5 font-mono text-[0.72rem] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" /> torna alla HUD
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground lg:text-4xl">
              StudierAI · esame orale — la demo reale, misurata.
            </h1>
            <p className="max-w-3xl text-base text-muted-foreground">
              Lo stack oral-exam di StudierAI (esaminatore su Realtime, contesto pieno) con
              Whisperer sotto. Stessa sessione, stesso prompt e voce — diverge solo il layer
              di memoria. Numeri misurati, non proiettati.
            </p>
          </div>
          <Badge
            variant="outline"
            className="h-7 shrink-0 rounded-lg border-[color:var(--recall)]/60 px-3 font-mono text-xs text-[color:var(--recall)]"
          >
            ~{sessionMinutes} min · N={runs} · misurato
          </Badge>
        </div>
      </header>

      {/* CONFIGURAZIONE */}
      <section className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-card p-5 shadow-sm lg:p-6">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-[color:var(--voice-accent)]">
            Configurazione
          </span>
          <span className="text-[0.78rem] text-muted-foreground">
            tutto lo stack di questo test, in chiaro
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {configRows.map((row) => (
            <ConfigRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      </section>

      {/* RISULTATO MISURATO */}
      <section className="flex flex-col gap-4 rounded-2xl border border-black/10 bg-card p-5 shadow-sm lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-foreground">
              Risultato misurato
            </span>
            <span className="text-[0.78rem] text-muted-foreground">
              recall (giudice binario) + costo a fine sessione
            </span>
          </div>
          <div className="flex items-baseline gap-2 font-mono">
            <span className="text-[0.72rem] uppercase tracking-wide text-muted-foreground">
              costo full-context / Whisperer
            </span>
            <span className="text-2xl font-bold tabular-nums text-[color:var(--fail)]">
              {headline.ratio}×
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <ResultPanel
            label="Base · cap (8)"
            recall={headline.baseCapped.recall}
            cost={headline.baseCapped.cost}
            note={headline.baseCapped.note}
            tone="muted"
          />
          <ResultPanel
            label="Base · full-context (≈ Realtime)"
            recall={headline.baseFull.recall}
            cost={headline.baseFull.cost}
            note={headline.baseFull.note}
            tone="fail"
          />
          <ResultPanel
            label="Whisperer"
            recall={headline.suggeritore.recall}
            cost={headline.suggeritore.cost}
            note={headline.suggeritore.note}
            tone="recall"
          />
        </div>

        {/* curva costo */}
        <div className="rounded-xl border border-black/10 bg-[color:var(--surface-soft)]/60 p-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
            <span className="font-mono text-[0.66rem] uppercase tracking-wider text-muted-foreground">
              costo cumulato · per turno · media N={runs}
            </span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.7rem] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full bg-[color:var(--fail)]" /> base
                full-context
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full bg-[color:var(--voice-accent)]" />{" "}
                Whisperer
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0 w-3.5 border-t-2 border-dashed border-[color:var(--muted-foreground)]" />{" "}
                base cap (dimentica)
              </span>
            </div>
          </div>
          <CostCurve curve={data.curve} ratio={headline.ratio} />
        </div>

        {/* nota onesta */}
        <div className="flex items-start gap-2 rounded-lg border border-black/10 bg-[color:var(--surface-soft)] px-4 py-3">
          <MinusIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-[0.82rem] leading-5 text-muted-foreground">
            <span className="font-medium text-foreground">Nota onesta:</span> il base{" "}
            <span className="font-medium">cappato</span> è economico ma perde il filo
            ({headline.baseCapped.recall}). Il base che <span className="font-medium">ricorda</span>{" "}
            è quello full-context ({headline.baseFull.recall}) — come la Realtime API che tiene tutta
            la sessione — e costa{" "}
            <span className="font-medium text-[color:var(--fail)]">{headline.ratio}×</span> Whisperer.
            Whisperer ricorda {headline.suggeritore.recall}{" "}
            <span className="font-medium text-[color:var(--recall)]">e</span> resta piatto. Gira su{" "}
            {config.modelHarness} (spesa reale pochi cent); il <span className="font-mono">$</span> è
            la lente Realtime audio che rispecchia {config.modelProd} — token shape reale, prezzo
            unitario = la lente di StudierAI.
          </p>
        </div>
      </section>
    </main>
  );
}
