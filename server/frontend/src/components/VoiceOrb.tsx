"use client";

import { cn } from "@/components/ui/utils";

export type OrbState = "idle" | "listening" | "speaking";

const PALETTE: Record<OrbState, { core: string; glow: string; ring: string }> = {
  idle: { core: "from-slate-200 to-slate-400", glow: "rgba(148,163,184,0.45)", ring: "bg-slate-300" },
  listening: { core: "from-sky-300 to-indigo-500", glow: "rgba(56,189,248,0.55)", ring: "bg-sky-400" },
  speaking: { core: "from-emerald-300 to-teal-500", glow: "rgba(16,185,129,0.6)", ring: "bg-emerald-400" },
};

/**
 * Sfera vocale immersiva: reagisce all'ampiezza dell'audio (mic in ascolto,
 * playback quando l'agente parla). idle = respiro lento; listening = blu;
 * speaking = verde. E' il cuore dell'esperienza realtime agentica.
 */
export function VoiceOrb({
  state,
  amplitude,
}: {
  state: OrbState;
  amplitude: number;
}) {
  const amp = Math.max(0, Math.min(1, amplitude));
  const active = state !== "idle";
  const scale = 1 + (active ? amp * 0.4 : 0);
  const glow = 40 + amp * 130;
  const p = PALETTE[state];

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: 320, height: 320 }}
    >
      <div
        className={cn("absolute rounded-full opacity-25 transition-transform duration-100", p.ring)}
        style={{ width: 320, height: 320, transform: `scale(${1 + amp * 0.12})` }}
      />
      <div
        className={cn("absolute rounded-full opacity-20 transition-transform duration-150", p.ring)}
        style={{ width: 250, height: 250, transform: `scale(${1 + amp * 0.22})` }}
      />
      <div
        className={cn(
          "rounded-full bg-gradient-to-br shadow-2xl transition-transform duration-75",
          p.core,
          !active && "animate-pulse"
        )}
        style={{
          width: 184,
          height: 184,
          transform: `scale(${scale})`,
          boxShadow: `0 0 ${glow}px ${p.glow}`,
        }}
      />
    </div>
  );
}
