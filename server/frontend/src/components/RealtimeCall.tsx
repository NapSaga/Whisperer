import React from "react";

import { AudioPlayback } from "@/components/AudioPlayback";
import MicIcon from "@/components/icons/MicIcon";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/utils";

interface RealtimeCallProps {
  isReady: boolean;
  isCalling: boolean;
  aiSpeaking: boolean;
  frequencies: number[];
  onToggle: () => void;
}

/**
 * UI realtime-native: una singola conversazione continua (non push-to-talk).
 * Il microfono resta aperto, il modello risponde da solo (server_vad) e lo puoi
 * interrompere parlandogli sopra (barge-in). Stati: idle / in ascolto / sta parlando.
 */
const RealtimeCall = ({
  isReady,
  isCalling,
  aiSpeaking,
  frequencies,
  onToggle,
}: RealtimeCallProps) => {
  const status = !isCalling
    ? "Premi per iniziare la conversazione"
    : aiSpeaking
    ? "L'esaminatore sta parlando — parla per interromperlo"
    : "In ascolto…";

  return (
    <div className="flex w-full items-center gap-3">
      <Button
        variant={isCalling ? "stop" : "outline"}
        disabled={!isReady}
        onClick={onToggle}
        aria-label={isCalling ? "Termina conversazione" : "Avvia conversazione"}
        className={cn(
          "h-10 rounded-full px-4 [&_svg]:size-5",
          isCalling
            ? "bg-red-100 hover:bg-red-200"
            : "border-2 border-gray-100 hover:bg-gray-200"
        )}
      >
        <span className="flex items-center gap-2">
          <MicIcon />
          {isCalling ? "Termina" : "Avvia"}
        </span>
      </Button>

      <div className="flex flex-1 items-center gap-3">
        {isCalling && (
          <AudioPlayback
            playbackFrequencies={frequencies}
            itemClassName={cn(
              "w-[4px] sm:w-[6px]",
              aiSpeaking ? "bg-emerald-400" : "bg-gray-400"
            )}
            className="w-24 gap-[3px]"
            height={28}
          />
        )}
        <span
          className={cn(
            "text-sm",
            aiSpeaking ? "text-emerald-600" : "text-gray-500"
          )}
        >
          {status}
        </span>
      </div>
    </div>
  );
};

export default RealtimeCall;
