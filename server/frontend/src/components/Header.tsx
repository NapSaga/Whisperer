"use client";

import Image from "next/image";

import WriteIcon from "@/components/icons/WriteIcon";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/utils";

function fmtDur(s: number) {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${ss}`;
}

export function Header({
  agentName,
  connected,
  isCalling,
  durationSec,
  realtime,
  resetConversation,
}: {
  agentName: string;
  connected: boolean;
  isCalling: boolean;
  durationSec: number;
  realtime: boolean;
  resetConversation: () => void;
}) {
  return (
    <header className="flex w-full items-center justify-between border-b border-gray-100 bg-white px-6 py-3">
      {/* Brand + persona/modello attivi */}
      <div className="flex items-center gap-3">
        <Image src="/logo.svg" alt="" width={22} height={22} />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-gray-900">Whisperer</span>
          <span className="text-[11px] text-gray-400">
            {agentName || "Suggeritore"}
            {realtime ? " · gpt-realtime-mini · IT" : ""}
          </span>
        </div>
      </div>

      {/* Stato live + azioni */}
      <div className="flex items-center gap-3">
        {isCalling ? (
          <span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            In chiamata {fmtDur(durationSec)}
          </span>
        ) : (
          <span
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm",
              connected
                ? "bg-emerald-50 text-emerald-700"
                : "bg-gray-100 text-gray-500"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connected ? "bg-emerald-500" : "bg-gray-400"
              )}
            />
            {connected ? "Connesso" : "Connessione…"}
          </span>
        )}
        <Button
          onClick={resetConversation}
          aria-label="Nuova conversazione"
          size="icon"
          title="Nuova conversazione"
        >
          <WriteIcon width={20} height={20} />
        </Button>
      </div>
    </header>
  );
}
