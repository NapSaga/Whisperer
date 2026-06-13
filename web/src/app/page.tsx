import { TranscriptShell } from "@/components/transcript-shell";
import {
  getCostFixture,
  getStateLedger,
  getTranscript,
  getTranscriptLane,
} from "@/lib/fixtures";

export default function Home() {
  const transcript = getTranscript();
  const state = getStateLedger();
  const cost = getCostFixture();

  return (
    <TranscriptShell
      baseTurns={getTranscriptLane(transcript, "base")}
      cost={cost}
      suggeritoreTurns={getTranscriptLane(transcript, "suggeritore")}
      state={state}
    />
  );
}
