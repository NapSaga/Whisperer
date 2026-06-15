"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import type { VerdictRun, VerdictsFixture } from "@/lib/contracts";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

function ScorePanel({
  label,
  score,
  tone,
}: {
  label: string;
  score: string;
  tone: "fail" | "recall";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border p-6",
        tone === "fail"
          ? "border-[color:var(--fail)]/50 bg-[color:var(--fail)]/10"
          : "border-[color:var(--recall)]/60 bg-[color:var(--recall)]/10 shadow-[0_0_40px_var(--recall-glow)]"
      )}
    >
      <span className="text-sm uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-6xl font-semibold leading-none",
          tone === "fail"
            ? "text-[color:var(--fail)]"
            : "text-[color:var(--recall)]"
        )}
      >
        {score}
      </span>
      <span className="text-xs text-muted-foreground">
        ricorda il fatto seminato
      </span>
    </div>
  );
}

function RunList({ runs, side }: { runs: VerdictRun[]; side: string }) {
  return (
    <div className="flex flex-col gap-2">
      {runs.map((run) => (
        <div
          key={`${side}-${run.run}`}
          className="flex items-start gap-3 rounded-lg border border-black/10 bg-[color:var(--surface-soft)] px-3 py-2 font-mono text-xs"
        >
          <span className="text-muted-foreground">
            #{String(run.run).padStart(2, "0")}
          </span>
          <span
            className={
              run.remembers
                ? "text-[color:var(--recall)]"
                : "text-[color:var(--fail)]"
            }
          >
            {run.remembers ? "✓ ricorda" : "✗ dimentica"}
          </span>
          <span className="text-muted-foreground">[{run.citation}]</span>
          <span className="flex-1 leading-5 text-muted-foreground">
            {run.reason}
          </span>
        </div>
      ))}
    </div>
  );
}

export function VerdictView({ verdicts }: { verdicts: VerdictsFixture }) {
  const [open, setOpen] = useState(false);
  const totalRuns =
    verdicts.runs.base.length + verdicts.runs.suggeritore.length;

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-black/10 bg-card p-6 shadow-2xl lg:p-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">Il verdetto — il numero</h2>
          <Badge
            variant="outline"
            className="h-7 rounded-lg border-[color:var(--recall)]/60 px-3 font-mono text-xs text-[color:var(--recall)]"
          >
            run-1330 · misurato
          </Badge>
        </div>
        <p className="max-w-3xl text-base text-muted-foreground">
          Stesso agente, N=10 run per lato. &ldquo;Ricorda il fatto del minuto
          uno?&rdquo; — sì/no, con citazione del turno. Niente vibes.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <ScorePanel label="Agente base" score={verdicts.score.base} tone="fail" />
        <ScorePanel
          label="Whisperer"
          score={verdicts.score.suggeritore}
          tone="recall"
        />
      </div>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 font-mono text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronDownIcon
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
          {open ? "Nascondi" : "Mostra"} i {totalRuns} run con le prove
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs uppercase tracking-wide text-[color:var(--fail)]">
              base · {verdicts.score.base}
            </span>
            <RunList runs={verdicts.runs.base} side="base" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs uppercase tracking-wide text-[color:var(--recall)]">
              suggeritore · {verdicts.score.suggeritore}
            </span>
            <RunList runs={verdicts.runs.suggeritore} side="sug" />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
