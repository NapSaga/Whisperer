import { TranscriptShell } from "@/components/transcript-shell";
import {
  getCostFixture,
  getLongCall,
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
  const longCall = getLongCall();

  return (
    <TranscriptShell
      baseTurns={getTranscriptLane(transcript, "base")}
      cost={cost}
      longCall={longCall}
      suggeritoreTurns={getTranscriptLane(transcript, "suggeritore")}
      state={state}
      verdicts={verdicts}
    />
  );
}
