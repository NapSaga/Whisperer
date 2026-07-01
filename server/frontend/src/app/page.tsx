"use client";

import AudioChat from "@/components/AudioChat";
import { ChatHistory } from "@/components/ChatDialog";
import { Composer } from "@/components/Composer";
import { Header } from "@/components/Header";
import { LedgerPanel } from "@/components/LedgerPanel";
import { VoiceOrb, type OrbState } from "@/components/VoiceOrb";
import { Recap } from "@/components/Recap";
import { Button } from "@/components/ui/Button";
import { useAudio } from "@/hooks/useAudio";
import { useWebsocket } from "@/hooks/useWebsocket";
import { useCallback, useEffect, useRef, useState } from "react";

import "./styles.css";

// Realtime-native quando il backend gira in modalita' realtime (SUGGERITORE_REALTIME).
// Off = demo push-to-talk (VoicePipeline) invariata.
const REALTIME = process.env.NEXT_PUBLIC_REALTIME === "on";

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [isCalling, setIsCalling] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [questions, setQuestions] = useState<string[]>([]);
  const [showRecap, setShowRecap] = useState(false);

  const {
    isReady: audioIsReady,
    playAudio,
    startRecording,
    stopRecording,
    startStreaming,
    stopStreaming,
    stopPlaying,
    frequencies,
    playbackFrequencies,
  } = useAudio();

  // Ref stabile a stopPlaying: consente handler WS stabili (niente reconnect a ogni render).
  const stopPlayingRef = useRef(stopPlaying);
  stopPlayingRef.current = stopPlaying;

  const handleNewAudio = useCallback(
    (audio: Int16Array<ArrayBuffer>) => {
      playAudio(audio);
      setAiSpeaking(true);
    },
    [playAudio]
  );
  const handleAudioDone = useCallback(() => setAiSpeaking(false), []);
  const handleInterrupt = useCallback(() => {
    void stopPlayingRef.current?.();
    setAiSpeaking(false);
  }, []);

  const {
    isReady: websocketReady,
    sendAudioMessage,
    sendAudioChunk,
    startCall,
    sendTextMessage,
    history: messages,
    resetHistory,
    isLoading,
    agentName,
    ledger,
    metrics,
    transcript,
    errorMsg,
    clearError,
  } = useWebsocket({
    onNewAudio: handleNewAudio,
    onAudioDone: handleAudioDone,
    onInterrupt: handleInterrupt,
  });

  function handleSubmit() {
    setPrompt("");
    sendTextMessage(prompt);
  }

  // Timer durata chiamata (cresce mentre isCalling; il costo/turno deve restare piatto).
  useEffect(() => {
    if (!isCalling) return;
    const id = setInterval(() => setDurationSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isCalling]);

  // Accumula gli argomenti trattati (per il recap): ogni nuova domanda dell'esaminatore.
  useEffect(() => {
    const q = metrics?.question?.trim();
    if (!q) return;
    setQuestions((prev) => (prev[prev.length - 1] === q ? prev : [...prev, q]));
  }, [metrics?.question]);

  async function toggleCall() {
    if (isCalling) {
      await stopStreaming();
      await stopPlaying();
      setIsCalling(false);
      setAiSpeaking(false);
      if (metrics) setShowRecap(true); // mostra il riepilogo se c'e' stata attivita'
    } else {
      setDurationSec(0);
      setQuestions([]);
      await startStreaming(sendAudioChunk); // mic aperto in streaming
      startCall("suggeritore"); // gira sempre Suggeritore; il confronto base e' proiettato
      setIsCalling(true);
    }
  }

  // Reset pulito: in realtime ricarichiamo la pagina -> WebSocket nuovo -> sessione,
  // ledger, costo e provider TUTTI freschi (il modo piu' robusto). Push-to-talk: soft reset.
  function handleReset() {
    if (REALTIME) {
      window.location.reload();
    } else {
      resetHistory();
    }
  }

  function closeRecap() {
    if (REALTIME) {
      window.location.reload();
      return;
    }
    setShowRecap(false);
    setDurationSec(0);
    setQuestions([]);
    resetHistory();
  }

  const ready = websocketReady && audioIsReady;
  const orbState: OrbState = !isCalling ? "idle" : aiSpeaking ? "speaking" : "listening";
  const amp = aiSpeaking ? avg(playbackFrequencies) : isCalling ? avg(frequencies) : 0;
  const statusLabel = !isCalling
    ? ready
      ? "Premi Avvia e parla — l'esaminatore ti risponde a voce"
      : "Connessione…"
    : aiSpeaking
    ? "L'esaminatore sta parlando — parlagli sopra per interromperlo"
    : "Ti ascolto…";

  return (
    <div className="w-full h-dvh flex flex-col">
      <Header
        agentName={agentName ?? ""}
        connected={websocketReady}
        isCalling={isCalling}
        durationSec={durationSec}
        realtime={REALTIME}
        resetConversation={handleReset}
      />

      {errorMsg ? (
        <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">
          <span>⚠️ {errorMsg}</span>
          <button
            onClick={clearError}
            className="rounded px-2 py-0.5 text-red-500 hover:bg-red-100"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>
      ) : null}
      <div className="flex w-full flex-1 min-h-0">
        {REALTIME ? (
          // Esperienza vocale immersiva: sfera al centro, pulita. Le metriche stanno
          // nel pannello destro (cruscotto), non affollano piu' l'orb.
          <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-7 px-6">
            <VoiceOrb state={orbState} amplitude={amp} />
            <p className="max-w-md text-center text-base text-gray-500">{statusLabel}</p>
            {isCalling && (transcript.user || transcript.assistant) ? (
              <div className="flex max-h-32 w-full max-w-lg flex-col gap-2.5 overflow-y-auto rounded-2xl border border-neutral-100 bg-neutral-50/70 px-5 py-4">
                {transcript.user ? (
                  <p className="text-sm leading-relaxed text-neutral-500">
                    <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                      Tu
                    </span>
                    {transcript.user}
                  </p>
                ) : null}
                {transcript.assistant ? (
                  <p className="text-sm leading-relaxed text-neutral-800">
                    <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                      Esaminatore
                    </span>
                    {transcript.assistant}
                  </p>
                ) : null}
              </div>
            ) : null}
            <Button
              onClick={toggleCall}
              disabled={!ready}
              variant={isCalling ? "stop" : "primary"}
              className={cnBtn(isCalling)}
            >
              {isCalling ? "Termina" : "Avvia conversazione"}
            </Button>
          </div>
        ) : (
          // Demo push-to-talk classica (VoicePipeline) — invariata.
          <div className="flex flex-1 min-h-0 flex-col items-center">
            <ChatHistory messages={messages} isLoading={isLoading} />
            <Composer
              prompt={prompt}
              setPrompt={setPrompt}
              onSubmit={handleSubmit}
              isLoading={isLoading}
              audioChat={
                <AudioChat
                  frequencies={frequencies}
                  isReady={ready}
                  startRecording={startRecording}
                  stopRecording={stopRecording}
                  sendAudioMessage={sendAudioMessage}
                />
              }
            />
          </div>
        )}
        <LedgerPanel
          ledger={ledger}
          metrics={metrics}
          durationSec={durationSec}
          showMetrics={REALTIME}
          memoryOn={true}
        />
      </div>

      {showRecap ? (
        <Recap
          durationSec={durationSec}
          metrics={metrics}
          ledger={ledger}
          questions={questions}
          onClose={closeRecap}
        />
      ) : null}
    </div>
  );
}

function cnBtn(isCalling: boolean) {
  return [
    "h-12 rounded-full px-8 text-base font-medium shadow-lg transition duration-200",
    "hover:-translate-y-0.5 hover:shadow-xl active:scale-95",
    isCalling ? "bg-red-500 hover:bg-red-600 text-white" : "",
  ].join(" ");
}
