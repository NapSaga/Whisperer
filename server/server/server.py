import asyncio
import os
import time
from collections.abc import AsyncIterator
from pathlib import Path
from logging import getLogger
from typing import Any, Dict

from agents import Runner, trace
from agents.voice import (
    TTSModelSettings,
    VoicePipeline,
    VoicePipelineConfig,
    VoiceWorkflowBase,
)
from whisperer import cost_meter, distiller, injector, state_store, truncation, watchdog
from whisperer.cost_meter import CostMeter
from app.agent_config import starting_agent, get_agent
from app import realtime_relay
from app.utils import (
    WebsocketHelper,
    concat_audio_chunks,
    extract_audio_chunk,
    is_audio_complete,
    is_new_audio_chunk,
    is_new_text_message,
    is_sync_message,
    is_text_output,
    process_inputs,
)
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse


from dotenv import load_dotenv

# Load the repo-root .env (where .env.example and the README place it), anchored
# to this file's location — NOT a cwd-relative path. `make serve` launches the
# server from server/server/, where a relative "../.env" resolves to a
# non-existent server/.env and the root file (keys + SUGGERITORE_* toggles)
# would be silently skipped. When the file is present it overrides the shell env.
_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=_ENV_PATH, override=True)

app = FastAPI()

# Boot: stampa la modalita' attiva (print -> visibile nei log uvicorn).
print(
    f"[BOOT] realtime={realtime_relay.is_enabled()} "
    f"provider={os.getenv('REALTIME_PROVIDER')} mode={os.getenv('SUGGERITORE_MODE')}",
    flush=True,
)

logger = getLogger(__name__)

# Rendi visibili i log [REALTIME]/[REALTIME-COST] su stdout: uvicorn non mostra di
# default gli INFO degli app-logger. Guardato per non duplicare handler sui reload.
import logging as _logging
import sys as _sys
for _n in ("app.realtime_relay", "whisperer.realtime_cost_meter"):
    _lg = _logging.getLogger(_n)
    if not _lg.handlers:
        _lg.setLevel(_logging.INFO)
        _lg.addHandler(_logging.StreamHandler(_sys.stdout))
        _lg.propagate = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _distill_every() -> int:
    try:
        return max(1, int(os.getenv("SUGGERITORE_DISTILL_EVERY", "4")))
    except ValueError:
        return 4


class Workflow(VoiceWorkflowBase):
    def __init__(self, connection: WebsocketHelper):
        self.connection = connection
        self._turn = 0
        self._msg_no = 0
        self._pending_turns: list[dict] = []
        self._distilling = False
        # One meter per Workflow so cumulative cost never leaks across runs (§5).
        self._cost = CostMeter()

    async def run(self, input_text: str) -> AsyncIterator[str]:
        conversation_history, latest_agent = await self.connection.show_user_input(
            input_text
        )

        # Whisperer re-grounding (SPEC §3, session-rotation): each turn sends a
        # compact input rehydrated from the ledger instead of the full history.
        # Base mode re-grounds nothing and caps context so early facts fall away.
        self._turn += 1
        self._msg_no += 1
        caller_turn = {"turn": f"t{self._msg_no}", "role": "caller", "text": input_text}

        run_input = conversation_history
        if injector.is_enabled():
            injector.strip(conversation_history)  # drop any stale ledger item in history
            # SPEC §3 session-rotation: every turn is a fresh input rehydrated
            # from the ledger (compact state + the question), not the resent
            # history — this is the cost win and what keeps recall robust.
            try:
                run_input = injector.compact_input(
                    conversation_history, state_store.current()
                )
            except Exception:
                logger.exception("suggeritore: compact input skipped")
        else:
            # Base mode: cap context so early-seeded facts fall out of the window.
            cap = int(os.getenv("SUGGERITORE_BASE_CAP", "8"))
            run_input = truncation.apply_context_cap(conversation_history, cap)

        output = Runner.run_streamed(
            latest_agent,
            run_input,
        )

        agent_text = ""
        async for event in output.stream_events():
            await self.connection.handle_new_item(event)

            if is_text_output(event):
                agent_text += event.data.delta  # type: ignore
                yield event.data.delta  # type: ignore

        await self.connection.text_output_complete(
            output, is_done=True, compact=injector.is_enabled()
        )

        # Watchdog (SPEC §4, opt-in): after the reply, a cheap check asks whether
        # it contradicts a known fact. On drift, re-inject that ONE fact and let
        # the agent answer again — the faithful §4 edge. Defensive: a watchdog
        # hiccup must never break the turn (same posture as the cost block). Only
        # in suggeritore mode (the ledger exists) and when the flag is on.
        responses = [output]
        if injector.is_enabled() and watchdog.is_enabled():
            try:
                state = state_store.current()
                if state.facts:
                    verdict = await watchdog.check(state, input_text, agent_text)
                    if verdict.drift:
                        corrective = injector.compact_input(conversation_history, state)
                        corrective.insert(-1, watchdog.correction_item(verdict))
                        retry = Runner.run_streamed(latest_agent, corrective)
                        agent_text = ""
                        async for event in retry.stream_events():
                            await self.connection.handle_new_item(event)
                            if is_text_output(event):
                                agent_text += event.data.delta  # type: ignore
                                yield event.data.delta  # type: ignore
                        await self.connection.text_output_complete(
                            retry, is_done=True, compact=injector.is_enabled()
                        )
                        responses.append(retry)
            except Exception:
                logger.exception("suggeritore: watchdog skipped")

        # Cost event (SPEC §5). Streamed usage is only final after the stream
        # drains, so sum it here. Defensive: a usage hiccup must never break the
        # turn — same posture as the injection/distill blocks. A watchdog
        # re-answer adds its own pass to the same turn's cost.
        try:
            raw = [r for resp in responses for r in resp.raw_responses]
            tokens_in = sum(r.usage.input_tokens for r in raw)
            tokens_out = sum(r.usage.output_tokens for r in raw)
            agent = "suggeritore" if injector.is_enabled() else "base"
            self._cost.add(tokens_in, tokens_out)
            self._cost.emit(agent, caller_turn["turn"])
        except Exception:
            logger.exception("suggeritore: cost emit skipped")

        # Record this exchange as contract transcript turns, then distill
        # periodically (SPEC §2) in suggeritore mode only — the live state.json
        # feeds the injector through the same path it reads.
        self._msg_no += 1
        agent_turn = {"turn": f"t{self._msg_no}", "role": "agent", "text": agent_text}
        self._pending_turns.extend([caller_turn, agent_turn])

        if injector.is_enabled() and self._turn % _distill_every() == 0:
            self._schedule_distill()

    def _schedule_distill(self) -> None:
        if self._distilling or not self._pending_turns:
            return
        batch = self._pending_turns
        self._pending_turns = []
        self._distilling = True
        asyncio.create_task(self._run_distill(batch))

    async def _run_distill(self, batch: list[dict]) -> None:
        try:
            updated = await distiller.distill(state_store.current(), batch)
            state_store.save(updated)
            # Mirror the freshly written ledger to the client (demo panel, §7).
            await self.connection.send_state(updated)
        except Exception:
            logger.exception("suggeritore: distillation failed")
        finally:
            self._distilling = False


async def _run_realtime(websocket: WebSocket) -> None:
    """Demo realtime speech-to-speech (SUGGERITORE_REALTIME=on).

    Ponte browser <-> provider realtime (Grok Voice / OpenAI GA) riusando il protocollo
    audio del frontend (append/commit + response.audio.delta) e il pannello memoria.
    La VoicePipeline resta il path di default quando il flag e' off.
    """
    # Chiamata nuova: ledger vuoto + contatore costo azzerato, pannello sincronizzato.
    state_store.reset()
    cost_meter.reset()
    # Risolvi la persona ORA (dopo load_dotenv), cosi' WHISPERER_AGENT_PROFILE dal
    # .env vale davvero — es. studierai_oral (esaminatore italiano).
    agent = get_agent()
    connection = WebsocketHelper(websocket, [], agent)
    await connection.send_state(state_store.current())

    relay = realtime_relay.RealtimeRelay(
        connection, getattr(agent, "instructions", "") or ""
    )
    if not await relay.connect():
        return
    pump = asyncio.create_task(relay.pump_provider())
    try:
        while True:
            message = await websocket.receive_json()
            if message.get("type") == "call.start":
                # lo studente avvia: imposta la modalita' A/B (suggeritore/base_cap/base_full)
                # e fai salutare per primo l'esaminatore.
                relay.set_mode(message.get("mode"))
                await relay.greet()
            elif is_new_audio_chunk(message):
                await relay.feed_append(message["delta"])
            elif is_audio_complete(message):
                await relay.feed_commit()
            elif is_sync_message(message):
                connection.history = message["inputs"]
    except WebSocketDisconnect:
        logger.info("realtime: client disconnected")
    finally:
        pump.cancel()
        await relay.close()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    with trace("Voice Agent Chat"):
        await websocket.accept()

        # Modalita' realtime (opt-in): speech-to-speech verso un provider realtime,
        # invece della VoicePipeline. Path di default invariato quando il flag e' off.
        if realtime_relay.is_enabled():
            await _run_realtime(websocket)
            return

        # Fresh call starts empty: wipe the runtime ledger to BLANK so the
        # suggeritore demo builds state.json from ONLY what the caller says
        # (the fixture is never read at runtime). Base mode never reads state.
        if injector.is_enabled():
            state_store.reset()

        # Truncate the cost file so the web counter shows only this call (§5).
        # Runs for BOTH modes — base and suggeritore each emit cost events.
        cost_meter.reset()

        connection = WebsocketHelper(websocket, [], starting_agent)
        audio_buffer = []

        # Start the demo ledger panel from the blank state this call begins with,
        # so it's clean and in sync before the first fact is distilled (§7).
        if injector.is_enabled():
            await connection.send_state(state_store.current())

        workflow = Workflow(connection)
        while True:
            try:
                message = await websocket.receive_json()
            except WebSocketDisconnect:
                print("Client disconnected")
                return

            # Handle text based messages
            if is_sync_message(message):
                connection.history = message["inputs"]
                if message.get("reset_agent", False):
                    connection.latest_agent = starting_agent
            elif is_new_text_message(message):
                user_input = process_inputs(message, connection)
                async for new_output_tokens in workflow.run(user_input):
                    await connection.stream_response(new_output_tokens, is_text=True)

            # Handle a new audio chunk
            elif is_new_audio_chunk(message):
                audio_buffer.append(extract_audio_chunk(message))

            # Send full audio to the agent
            elif is_audio_complete(message):
                start_time = time.perf_counter()

                def transform_data(data):
                    nonlocal start_time
                    if start_time:
                        print(
                            f"Time taken to first byte: {time.perf_counter() - start_time}s"
                        )
                        start_time = None
                    return data

                audio_input = concat_audio_chunks(audio_buffer)
                output = await VoicePipeline(
                    workflow=workflow,
                    config=VoicePipelineConfig(
                        tts_settings=TTSModelSettings(
                            buffer_size=512, transform_data=transform_data
                        )
                    ),
                ).run(audio_input)
                async for event in output.stream():
                    await connection.send_audio_chunk(event)

                audio_buffer = []  # reset the audio buffer


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
