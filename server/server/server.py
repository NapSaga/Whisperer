import asyncio
import os
import time
from collections.abc import AsyncIterator
from logging import getLogger
from typing import Any, Dict

from agents import Runner, trace
from agents.voice import (
    TTSModelSettings,
    VoicePipeline,
    VoicePipelineConfig,
    VoiceWorkflowBase,
)
from app import distiller, injector, state_store, truncation
from app.agent_config import starting_agent
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

# When .env file is present, it will override the environment variables
load_dotenv(dotenv_path="../.env", override=True)

app = FastAPI()

logger = getLogger(__name__)

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

    async def run(self, input_text: str) -> AsyncIterator[str]:
        conversation_history, latest_agent = await self.connection.show_user_input(
            input_text
        )

        # Suggeritore re-grounding (SPEC §3, periodic). Base mode is a no-op:
        # run_input stays the unmodified conversation_history.
        self._turn += 1
        self._msg_no += 1
        caller_turn = {"turn": f"t{self._msg_no}", "role": "caller", "text": input_text}

        run_input = conversation_history
        if injector.is_enabled():
            injector.strip(conversation_history)  # drop any stale injection carried over
            if injector.should_inject(self._turn):
                try:
                    run_input = injector.with_injection(
                        conversation_history, state_store.current()
                    )
                except Exception:
                    logger.exception("suggeritore: injection skipped")
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

        await self.connection.text_output_complete(output, is_done=True)

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
        except Exception:
            logger.exception("suggeritore: distillation failed")
        finally:
            self._distilling = False


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    with trace("Voice Agent Chat"):
        await websocket.accept()

        # Fresh call starts empty: wipe the runtime ledger to BLANK so the
        # suggeritore demo builds state.json from ONLY what the caller says
        # (the fixture is never read at runtime). Base mode never reads state.
        if injector.is_enabled():
            state_store.reset()

        connection = WebsocketHelper(websocket, [], starting_agent)
        audio_buffer = []

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
