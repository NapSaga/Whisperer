"use client";

import { cn } from "@/components/ui/utils";

export type Mode = "suggeritore" | "base_cap" | "base_full";

const OPTIONS: { value: Mode; label: string; hint: string }[] = [
  { value: "suggeritore", label: "Suggeritore", hint: "memoria ON — ledger + re-grounding" },
  { value: "base_cap", label: "Base cappato", hint: "dimentica — contesto troncato" },
  { value: "base_full", label: "Base pieno", hint: "contesto pieno del provider" },
];

/**
 * Interruttore A/B del test 15 min: stessa lezione nei tre modi per confrontare
 * recall / costo / latenza dal vivo. Bloccato durante la chiamata (cambio = nuova call).
 */
export function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "inline-flex rounded-full border border-neutral-200 bg-neutral-50 p-1",
          disabled && "opacity-60"
        )}
      >
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition",
              mode === o.value
                ? "bg-white font-medium text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700",
              disabled ? "cursor-not-allowed" : "cursor-pointer"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <span className="text-[11px] text-neutral-400">
        {OPTIONS.find((o) => o.value === mode)?.hint}
      </span>
    </div>
  );
}
