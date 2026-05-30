#
# Copyright (c) 2024–2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Field & Flower — flower shop voice ordering bot (hackathon starter).

A customer calls in and the bot helps them pick a bouquet and arrange delivery.
All backend calls (catalog, customer lookup, order placement) are mocked so the
starter runs with no external dependencies beyond the AI services.

Pipeline: Nemotron Speech Streaming STT → Nemotron-3-Super-120B LLM → Gradium TTS, with direct
function tools registered on the LLM context.

Run the bot using::

    uv run bot-nemotron.py
"""

import os
import random
from datetime import date

import aiohttp
from dotenv import load_dotenv
from loguru import logger
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import EndTaskFrame, FunctionCallResultProperties, LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frame_processor import FrameDirection
from pipecat.runner.types import (
    RunnerArguments,
    SmallWebRTCRunnerArguments,
    WebSocketRunnerArguments,
)
from pipecat.runner.utils import parse_telephony_websocket
from pipecat.serializers.twilio import TwilioFrameSerializer
from pipecat.services.gradium.tts import GradiumTTSService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams, FastAPIWebsocketTransport
from pipecat.turns.user_turn_strategies import FilterIncompleteUserTurnStrategies
from pipecat.workers.runner import WorkerRunner

from mock_backend import BOUQUETS, KNOWN_CUSTOMERS
from nemotron_llm import VLLMOpenAILLMService
from nvidia_stt import NVidiaWebSocketSTTService

# Ember: live attribution wiring.
from ember_prompt import build_blocks, render_system
from hub import shared_hub
from observer import EmberObserver

load_dotenv(override=True)


async def get_call_info(call_sid: str) -> dict:
    """Fetch call information from Twilio REST API using aiohttp.

    Args:
        call_sid: The Twilio call SID

    Returns:
        Dictionary containing call information including from_number, to_number, status, etc.
    """
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")

    if not account_sid or not auth_token:
        logger.warning("Missing Twilio credentials, cannot fetch call info")
        return {}

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Calls/{call_sid}.json"

    try:
        # Use HTTP Basic Auth with aiohttp
        auth = aiohttp.BasicAuth(account_sid, auth_token)

        async with aiohttp.ClientSession() as session:
            async with session.get(url, auth=auth) as response:
                if response.status != 200:
                    error_text = await response.text()
                    logger.error(f"Twilio API error ({response.status}): {error_text}")
                    return {}

                data = await response.json()

                call_info = {
                    "from_number": data.get("from"),
                    "to_number": data.get("to"),
                }

                return call_info

    except Exception as e:
        logger.error(f"Error fetching call info from Twilio: {e}")
        return {}


async def run_bot(
    transport: BaseTransport,
    from_number: str | None = None,
    audio_in_sample_rate: int = 16000,
    audio_out_sample_rate: int = 24000,
):
    """Main bot logic.

    Args:
        transport: The transport to use.
        from_number: Caller's phone number (Twilio path only) for known-customer lookup.
        audio_in_sample_rate: Input audio sample rate in Hz. Defaults to 16000 (WebRTC).
        audio_out_sample_rate: Output audio sample rate in Hz. Defaults to 24000 (WebRTC).
    """
    logger.info("Starting bot")

    # Per-call state: notes the partner jots during office hours.
    notes: list = []

    async def take_note(params: FunctionCallParams, note: str) -> None:
        """Jot a note about what you just learned — a signal, a fact, or a red flag.
        Call this whenever the founder reveals something worth remembering.

        Args:
            note: One short line, e.g. "named a specific paying customer".
        """
        notes.append(note)
        await params.result_callback({"ok": True, "noted": note, "count": len(notes)})

    async def final_report(
        params: FunctionCallParams, verdict: str, reasons: str, next_step: str = ""
    ) -> None:
        """Produce the final office-hours report at the end of the session.

        Args:
            verdict: One of "advance", "maybe", or "pass".
            reasons: One or two short sentences on why.
            next_step: The single concrete next action for the founder.
        """
        logger.info(f"Final report: {verdict} -- {reasons} | next: {next_step} | notes={notes}")
        await params.result_callback(
            {"ok": True, "verdict": verdict, "reasons": reasons,
             "next_step": next_step, "notes": notes}
        )

    async def end_call(params: FunctionCallParams) -> None:
        """End office hours. Call this AFTER your closing line in the same turn —
        either because the founder isn't ready, or right after final_report."""
        logger.info("end_call invoked -- pushing EndTaskFrame upstream")
        await params.llm.push_frame(EndTaskFrame(), FrameDirection.UPSTREAM)
        await params.result_callback(
            {"ok": True}, properties=FunctionCallResultProperties(run_llm=False)
        )

    tool_functions = [
        take_note,
        final_report,
        end_call,
    ]
    tools = ToolsSchema(standard_tools=tool_functions)

    # --- System instruction (varies based on caller ID) ---------------------

    caller_context = (
        "You're meeting this founder for the first time at office hours. You know "
        "nothing about their startup yet."
    )

    # Ember: author the system prompt as labeled blocks so attribution can
    # ablate each one. render_system() matches the attribution service byte-for-byte.
    ember_blocks = build_blocks(date.today().strftime("%A, %B %d, %Y"), caller_context)
    system_instruction = render_system(ember_blocks)
    _unused_original_prompt = (  # kept for reference; superseded by ember_blocks
        "You are a friendly order-taker for Field & Flower, a neighborhood flower shop. "
        "Help callers pick a bouquet and arrange delivery. Use the tools to look up "
        "bouquets, check stock, add items, capture delivery details, and place the order. "
        "Confirm the full order before calling place_order.\n\n"
        "Talk like a real shop clerk on the phone — not a chatbot:\n"
        "- Keep it to 1–2 short sentences per turn. Longer only when listing options or "
        "doing the final order read-back.\n"
        "- Ask ONE thing at a time. Don't ask for name, address, and date in one breath — "
        "ask for the name, wait, then the next.\n"
        '- Skip filler openers like "Absolutely!", "That sounds lovely!", "Perfect!", '
        '"I\'d be happy to" — go straight to the point.\n'
        "- Describe bouquets plainly. \"A dozen red roses with baby's breath, sixty-five "
        'dollars." Not "a classic, romantic bouquet showing love and appreciation."\n'
        "- When listing bouquets, ALWAYS lead with the bouquet's name. Format: "
        '"<Name> — <description>, <price>." For example: "Spring Sunshine — yellow tulips '
        'and daffodils, forty-five dollars." The name is how the caller refers back to it.\n'
        "- When the caller mentions an occasion (birthday, Mother's Day, anniversary, "
        "sympathy, etc.) or asks about specials/deals, pass those as filters to "
        'list_bouquets (occasion="..." or specials_only=True) instead of reading the '
        "full catalog. Don't list 15 bouquets when 3 are relevant.\n"
        "- The catalog has many options — when listing, name at most 4 or 5 at a time. "
        "If the caller doesn't bite, offer to share more.\n"
        "- Don't restate what the customer just said back to them, except in the final "
        "order confirmation.\n"
        "- Use contractions. Fragments are fine.\n\n"
        "Responses are spoken aloud. No bullet points, no emojis. Read prices in words "
        '("forty-five dollars", not "$45.00").\n\n'
        "When the order is placed and the customer has no more requests, or when they say "
        'goodbye: say a short closing line (e.g. "Thanks, have a great day!") AND call '
        "end_call in the same turn. Never call end_call without saying goodbye first.\n\n"
        f"Today is {date.today().strftime('%A, %B %d, %Y')}. Use this when the caller "
        'gives a relative delivery date like "this Friday" or "next Tuesday".\n\n'
        f"Caller context: {caller_context}"
    )

    # Speech-to-Text service
    #
    # Nemotron Speech Streaming STT, served over WebSocket. The server expects
    # 16-bit PCM, 16 kHz, mono — matching the WebRTC input path. The URL can be
    # overridden via NVIDIA_ASR_URL.
    stt = NVidiaWebSocketSTTService(
        url=os.getenv("NVIDIA_ASR_URL", "ws://192.168.7.228:8081"),
        strip_interim_prefix=True,
    )

    # LLM service — Nemotron-3-Super-120B served by vLLM (OpenAI-compatible chat
    # completions at /v1). vLLM exposes the Chat Completions API, not the Responses
    # API, so we use OpenAILLMService (not OpenAIResponsesLLMService). The live
    # endpoint serves the model as "nemotron-3-super" (per its /v1/models).
    #
    # Reasoning ("thinking") toggle — Nemotron is controlled per-request via
    # chat_template_kwargs.enable_thinking, forwarded through the OpenAI client's
    # extra_body (the request-body convention confirmed against this endpoint in
    # ../aiewf-eval traces). Default OFF for low-latency voice. To ENABLE, set
    # NEMOTRON_ENABLE_THINKING=true; to DISABLE, leave unset/false.
    #
    # CAUTION for voice: reasoning is only kept out of the spoken `content` if the
    # vLLM server runs a reasoning parser (e.g. --reasoning-parser nemotron_v3, which
    # routes it to a separate `reasoning_content` field). This live endpoint did NOT
    # surface reasoning_content in testing, so if thinking is enabled and the server
    # lacks a parser, chain-of-thought would appear inline in `content` and get
    # spoken. Keep thinking OFF for voice unless the parser is confirmed active.
    # VLLMOpenAILLMService is a thin OpenAILLMService subclass that reports TTFB to
    # the first NON-THINKING token (so the metric reflects time-to-first-spoken-word
    # when reasoning is enabled, not time-to-first-reasoning-token). No-op when
    # thinking is off. See server/nemotron_llm.py.
    enable_thinking = os.getenv("NEMOTRON_ENABLE_THINKING", "false").lower() == "true"
    llm = VLLMOpenAILLMService(
        api_key=os.getenv("NEMOTRON_LLM_API_KEY", "EMPTY"),  # vLLM ignores unless --api-key set
        base_url=os.getenv("NEMOTRON_LLM_URL", "http://192.168.7.228:8000/v1"),
        settings=VLLMOpenAILLMService.Settings(
            model=os.getenv("NEMOTRON_LLM_MODEL", "nvidia/nemotron-3-super"),
            system_instruction=system_instruction,
            extra={"extra_body": {"chat_template_kwargs": {"enable_thinking": enable_thinking}}},
        ),
    )

    # Text-to-Speech service
    tts = GradiumTTSService(
        api_key=os.environ["GRADIUM_API_KEY"],
        settings=GradiumTTSService.Settings(
            voice=os.getenv("GRADIUM_VOICE_ID", "Eu9iL_CYe8N-Gkx_"),
        ),
    )

    # ToolsSchema describes the tools to the LLM; register_direct_function
    # wires the actual handlers the LLM will invoke. Both are required.
    for fn in tool_functions:
        llm.register_direct_function(fn)

    # Inject the system prompt as the first context message. (Passing it only via
    # the LLM service's system_instruction is a no-op for this vLLM/OpenAI path, so
    # without this the model gets NO prompt and just echoes the caller.)
    context = LLMContext(
        messages=[{"role": "system", "content": system_instruction}],
        tools=tools,
    )
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(),
            user_turn_strategies=FilterIncompleteUserTurnStrategies(),
        ),
    )

    # Pipeline - assembled from reusable components
    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            assistant_aggregator,
        ]
    )

    # Ember: attach the observer so every turn streams to the viz
    # (ws://localhost:8765) for live attribution. The hub is a process-wide
    # singleton started once — and a hub failure must NEVER crash the call.
    ember_observers = []
    ember_hub = None
    try:
        ember_hub = await shared_hub()
        ember_observers = [EmberObserver(ember_hub, ember_blocks)]
    except Exception as e:
        logger.warning(f"Ember hub unavailable, continuing without it: {e}")

    worker = PipelineWorker(
        pipeline,
        observers=ember_observers,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
            audio_in_sample_rate=audio_in_sample_rate,
            audio_out_sample_rate=audio_out_sample_rate,
        ),
    )

    # Nemotron can't call the registered end_call tool, so the observer's
    # side-extraction detects the end intent and triggers the real hangup here.
    async def _hang_up():
        logger.info("Ember side-extraction -> ending call (EndTaskFrame)")
        await worker.queue_frames([EndTaskFrame()])

    for _obs in ember_observers:
        _obs.on_tool_end = _hang_up

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Client connected")
        # "Resume from here": the viz seeded the prior conversation over the hub.
        # Replay it into the context so the partner remembers everything up to the
        # branch point, then let the founder keep talking (no greeting kickoff).
        seed = getattr(ember_hub, "pending_seed", None) if ember_hub else None
        if seed:
            ember_hub.pending_seed = None  # consume once
            for msg in seed:
                if isinstance(msg, dict) and msg.get("role") in ("user", "assistant") and msg.get("content"):
                    context.add_message({"role": msg["role"], "content": msg["content"]})
            # Mirror the history into the observer so replays of resumed turns
            # carry the full prior conversation.
            for _obs in ember_observers:
                _obs.history = [m for m in seed
                                if isinstance(m, dict) and m.get("role") in ("user", "assistant")]
            logger.info(f"Resumed from seed: {len(seed)} prior messages")
            # If the branch point ends on the founder, answer it; otherwise wait.
            if seed and seed[-1].get("role") == "user":
                await worker.queue_frames([LLMRunFrame()])
            return
        # Fresh call: kick off office hours with the opening line.
        context.add_message(
            {
                "role": "user",
                "content": "A founder just sat down for office hours. Open with exactly: 'Alright, you have two minutes. What are you building, and who is it for?'",
            }
        )
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected")
        await worker.cancel()

    runner = WorkerRunner(handle_sigint=False)

    await runner.add_workers(worker)
    await runner.run()


async def bot(runner_args: RunnerArguments):
    """Main bot entry point."""

    from_number: str | None = None
    transport_overrides: dict = {}

    # Krisp is available when deployed to Pipecat Cloud
    if os.environ.get("ENV") != "local":
        from pipecat.audio.filters.krisp_viva_filter import KrispVivaFilter

        krisp_filter = KrispVivaFilter()
    else:
        krisp_filter = None

    match runner_args:
        case SmallWebRTCRunnerArguments():
            webrtc_connection: SmallWebRTCConnection = runner_args.webrtc_connection

            transport = SmallWebRTCTransport(
                webrtc_connection=webrtc_connection,
                params=TransportParams(
                    audio_in_enabled=True,
                    audio_in_filter=krisp_filter,
                    audio_out_enabled=True,
                ),
            )
        case WebSocketRunnerArguments():
            # Twilio media streams are 8 kHz μ-law in both directions.
            # This overrides the default sample rates: 16 kHz in / 24 kHz out.
            transport_overrides["audio_in_sample_rate"] = 8000
            transport_overrides["audio_out_sample_rate"] = 8000

            # Parse Twilio websocket and fetch call information
            _, call_data = await parse_telephony_websocket(runner_args.websocket)

            # Fetch call information from Twilio REST API so we can personalize
            # the bot for known customers (see KNOWN_CUSTOMERS).
            call_info = await get_call_info(call_data["call_id"])
            if call_info:
                from_number = call_info.get("from_number")
                logger.info(f"Call from: {from_number} to: {call_info.get('to_number')}")

            serializer = TwilioFrameSerializer(
                stream_sid=call_data["stream_id"],
                call_sid=call_data["call_id"],
                account_sid=os.getenv("TWILIO_ACCOUNT_SID", ""),
                auth_token=os.getenv("TWILIO_AUTH_TOKEN", ""),
            )

            transport = FastAPIWebsocketTransport(
                websocket=runner_args.websocket,
                params=FastAPIWebsocketParams(
                    audio_in_enabled=True,
                    audio_in_filter=krisp_filter,
                    audio_out_enabled=True,
                    add_wav_header=False,
                    serializer=serializer,
                ),
            )
        case _:
            logger.error(f"Unsupported runner arguments type: {type(runner_args)}")
            return

    await run_bot(transport, from_number=from_number, **transport_overrides)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
