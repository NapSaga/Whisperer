import { TranscriptShell } from "@/components/transcript-shell";
import {
  getCostFixture,
  getStateLedger,
  getTranscript,
  getTranscriptLane,
  getVerdicts,
} from "@/lib/fixtures";

export default function Home() {
  const transcript = getTranscript();
  const state = getStateLedger();
  const cost = getCostFixture();
  const verdicts = getVerdicts();

  return (
    <TranscriptShell
      baseTurns={getTranscriptLane(transcript, "base")}
      cost={cost}
      suggeritoreTurns={getTranscriptLane(transcript, "suggeritore")}
      state={state}
      verdicts={verdicts}
    />
  );
}
