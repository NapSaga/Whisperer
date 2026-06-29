"use client";

import AudioChat from "@/components/AudioChat";
import { ChatHistory } from "@/components/ChatDialog";
import { Composer } from "@/components/Composer";
import { Header } from "@/components/Header";
import { LedgerPanel } from "@/components/LedgerPanel";
import { useAudio } from "@/hooks/useAudio";
import { useWebsocket } from "@/hooks/useWebsocket";
import { useState } from "react";

import "./styles.css";

export default function Home() {
  const [prompt, setPrompt] = useState("");

  const {
    isReady: audioIsReady,
    playAudio,
    startRecording,
    stopRecording,
    stopPlaying,
    frequencies,
    playbackFrequencies,
  } = useAudio();
  const {
    isReady: websocketReady,
    sendAudioMessage,
    sendTextMessage,
    history: messages,
    resetHistory,
    isLoading,
    agentName,
    ledger,
  } = useWebsocket({
    onNewAudio: playAudio,
  });

  function handleSubmit() {
    setPrompt("");
    sendTextMessage(prompt);
  }

  async function handleStopPlaying() {
    await stopPlaying();
  }

  return (
    <div className="w-full h-dvh flex flex-col">
      <Header
        agentName={agentName ?? ""}
        playbackFrequencies={playbackFrequencies}
        stopPlaying={handleStopPlaying}
        resetConversation={resetHistory}
      />
      <div className="flex w-full flex-1 min-h-0">
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
                isReady={websocketReady && audioIsReady}
                startRecording={startRecording}
                stopRecording={stopRecording}
                sendAudioMessage={sendAudioMessage}
              />
            }
          />
        </div>
        <LedgerPanel ledger={ledger} />
      </div>
    </div>
  );
}
