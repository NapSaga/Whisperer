import { TranscriptShell } from "@/components/transcript-shell";
import {
  getStateLedger,
  getTranscript,
  getTranscriptLane,
} from "@/lib/fixtures";

export default function Home() {
  const transcript = getTranscript();
  const state = getStateLedger();

  return (
    <TranscriptShell
      baseTurns={getTranscriptLane(transcript, "base")}
      suggeritoreTurns={getTranscriptLane(transcript, "suggeritore")}
      state={state}
    />
  );
}
