import { useEffect, useRef, useState } from "react";

import { Ledger, Message, Metrics, Transcript } from "@/lib/types";
import { arrayBufferToBase64, base64ToArrayBuffer } from "@/lib/utils";

export function useWebsocket({
  url,
  onNewAudio,
  onAudioDone,
  onInterrupt,
}: {
  url?: string;
  onNewAudio?: (audio: Int16Array<ArrayBuffer>) => void;
  onAudioDone?: () => void;
  onInterrupt?: () => void;
} = {}) {
  url =
    url ??
    process.env.NEXT_PUBLIC_WEBSOCKET_ENDPOINT ??
    "ws://localhost:8000/ws";
  const [isReady, setIsReady] = useState(false);
  const [history, setHistory] = useState<Message[]>([]);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [transcript, setTranscript] = useState<Transcript>({
    user: "",
    assistant: "",
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const websocket = useRef<WebSocket | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => {
      setIsReady(true);
    });
    ws.addEventListener("close", () => {
      setIsReady(false);
    });
    ws.addEventListener("error", (event) => {
      setIsReady(false);
      setIsLoading(false);
      console.error("Websocket error", event);
    });
    ws.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "history.updated") {
        if (data.inputs[data.inputs.length - 1].role !== "user") {
          setIsLoading(false);
        }
        setHistory(data.inputs);
        if (data.agent_name) {
          setAgentName(data.agent_name);
        }
      } else if (data.type === "response.audio.delta") {
        const audioData = new Int16Array(base64ToArrayBuffer(data.delta));
        if (typeof onNewAudio === "function") {
          onNewAudio(audioData);
        }
      } else if (data.type === "audio.done") {
        if (typeof onAudioDone === "function") {
          onAudioDone();
        }
      } else if (data.type === "state.updated") {
        setLedger(data.state as Ledger);
      } else if (data.type === "metrics") {
        setMetrics(data as Metrics);
      } else if (data.type === "transcript") {
        const role = data.role === "user" ? "user" : "assistant";
        setTranscript((t) => ({ ...t, [role]: data.text as string }));
      } else if (data.type === "interrupted") {
        // barge-in: l'utente ha ripreso a parlare -> ferma la riproduzione.
        if (typeof onInterrupt === "function") {
          onInterrupt();
        }
      } else if (data.type === "error") {
        setErrorMsg((data.message as string) || "Errore realtime");
      }
    });

    websocket.current = ws;
  }, [url, onNewAudio, onAudioDone, onInterrupt]);

  useEffect(() => {
    return () => {
      websocket.current?.close();
    };
  }, []);

  function sendTextMessage(message: string) {
    setIsLoading(true);
    const newHistory = [
      ...history,
      {
        role: "user",
        content: message,
        type: "message",
      } as Message,
    ];
    setHistory(newHistory);
    websocket.current?.send(
      JSON.stringify({
        type: "history.update",
        inputs: newHistory,
      })
    );
  }

  // Realtime-native: segnala l'avvio + la modalita' A/B (suggeritore/base_cap/base_full).
  function startCall(mode?: string) {
    websocket.current?.send(JSON.stringify({ type: "call.start", mode }));
  }

  // Realtime-native: invia un chunk audio in streaming (append only). Il turno lo
  // chiude il server_vad lato server, quindi niente commit dal client.
  function sendAudioChunk(audio: Int16Array<ArrayBuffer>) {
    if (!audio || audio.byteLength === 0) return; // niente chunk vuoti
    websocket.current?.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        delta: arrayBufferToBase64(audio.buffer),
      })
    );
  }

  function resetHistory() {
    setHistory([]);
    setIsLoading(false);
    setAgentName(null);
    setLedger(null);
    setMetrics(null);
    setTranscript({ user: "", assistant: "" });
    websocket.current?.send(
      JSON.stringify({
        type: "history.update",
        inputs: [],
        reset_agent: true,
      })
    );
  }
  function sendAudioMessage(audio: Int16Array<ArrayBuffer>) {
    if (!websocket.current) {
      throw new Error("Websocket not connected");
    }
    websocket.current.send(
      JSON.stringify({
        type: "history.update",
        inputs: history,
      })
    );
    websocket.current.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        delta: arrayBufferToBase64(audio.buffer),
      })
    );
    websocket.current.send(
      JSON.stringify({
        type: "input_audio_buffer.commit",
      })
    );
  }

  return {
    isReady,
    sendTextMessage,
    sendAudioMessage,
    sendAudioChunk,
    startCall,
    history,
    resetHistory,
    agentName,
    isLoading,
    ledger,
    metrics,
    transcript,
    errorMsg,
    clearError: () => setErrorMsg(null),
  };
}
