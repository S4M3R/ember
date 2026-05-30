"""Cekura chat-WebSocket adapter for the YC Partner office-hours agent.

Cekura's `scenarios_run_websocket` / text runner speaks a dead-simple JSON chat
protocol (see github.com/vocera-ai/llm-websocket-server-example):

    • On connect, the server sends the agent's opening line:   {"content": "..."}
    • For each founder turn, Cekura sends                       {"content": "<text>"}
    • The server replies with the partner's turn               {"content": "<text>"}

This wraps the SAME Nemotron LLM + office-hours system prompt + tools the voice
bot uses (`bot-nemotron.py`), but in text mode — no STT/TTS — so Cekura's testing
agent (the simulated founder) can hold a real conversation and the metrics can
score it. The founder scenario ends the call via its own end-call tool; the
partner's end_call is handled here too for a clean close when Nemotron emits it.

Run:
    uv run python cekura_ws.py            # ws://0.0.0.0:8770
Then expose with ngrok and point Cekura at the public wss:// URL.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import date

import websockets
from dotenv import load_dotenv
from loguru import logger
from openai import AsyncOpenAI

from ember_prompt import build_blocks, render_system

load_dotenv(override=True)

WS_HOST = os.getenv("CEKURA_WS_HOST", "0.0.0.0")
WS_PORT = int(os.getenv("CEKURA_WS_PORT", "8770"))

# The partner opens the same way the voice bot does (see bot-nemotron.py
# on_client_connected). Cekura's agent_gives_first_message=True for this agent.
OPENING_LINE = "Alright, you have two minutes. What are you building, and who is it for?"

_caller_context = (
    "You're meeting this founder for the first time at office hours. You know "
    "nothing about their startup yet."
)
SYSTEM_INSTRUCTION = render_system(
    build_blocks(date.today().strftime("%A, %B %d, %Y"), _caller_context)
)

_ENABLE_THINKING = os.getenv("NEMOTRON_ENABLE_THINKING", "false").lower() == "true"

client = AsyncOpenAI(
    api_key=os.getenv("NEMOTRON_LLM_API_KEY", "EMPTY"),
    base_url=os.getenv("NEMOTRON_LLM_URL", "http://192.168.7.228:8000/v1"),
)
MODEL = os.getenv("NEMOTRON_LLM_MODEL", "nvidia/nemotron-3-super")

# Same tools the voice bot registers, expressed as OpenAI function schemas so the
# partner can jot notes and deliver a verdict. Termination is robust either way:
# the founder scenario ends the call on its side via TOOL_END_CALL.
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "take_note",
            "description": "Jot a note about what you just learned — a signal, a fact, or a red flag.",
            "parameters": {
                "type": "object",
                "properties": {"note": {"type": "string", "description": "One short line."}},
                "required": ["note"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "final_report",
            "description": "Produce the final office-hours verdict at the end of the session.",
            "parameters": {
                "type": "object",
                "properties": {
                    "verdict": {"type": "string", "enum": ["advance", "maybe", "pass"]},
                    "reasons": {"type": "string"},
                    "next_step": {"type": "string"},
                },
                "required": ["verdict", "reasons"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "end_call",
            "description": "End office hours after your closing line, in the same turn.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

# Per-connection conversation state.
_sessions: dict[int, dict] = {}


# Nemotron habitually externalizes its private notes as "(Note: ...)" asides or
# "Note:" lines even when told not to. Those are stage directions, not speech —
# strip them so only the spoken words reach Cekura's transcript.
_NOTE_PAREN = re.compile(r"\(\s*note[^)]*\)", re.IGNORECASE)
_NOTE_LINE = re.compile(r"(?im)^\s*note\s*:.*$")
# Nemotron sometimes emits a literal native tool call as text instead of a real
# function call: "<tool_call> <function=final_report> ... </function> </tool_call>".
# Strip the whole block — it's machinery, never speech.
_TOOL_CALL = re.compile(r"<tool_call>.*?</tool_call>", re.IGNORECASE | re.DOTALL)
_TOOL_TAGS = re.compile(r"</?(?:tool_call|function|parameter)\b[^>]*>", re.IGNORECASE)


def _clean(text: str) -> str:
    text = _TOOL_CALL.sub("", text)
    text = _TOOL_TAGS.sub("", text)  # catch unbalanced/half-emitted tags
    text = _NOTE_PAREN.sub("", text)
    text = _NOTE_LINE.sub("", text)
    # Collapse blank lines / stray whitespace left behind.
    text = re.sub(r"\n{2,}", "\n", text).strip()
    return re.sub(r"[ \t]{2,}", " ", text)


async def _complete(messages: list[dict]):
    """One Nemotron completion. Thinking off for snappy, spoken-style replies."""
    return await client.chat.completions.create(
        model=MODEL,
        messages=messages,
        tools=TOOLS,
        temperature=0.0,
        max_tokens=512,
        extra_body={"chat_template_kwargs": {"enable_thinking": _ENABLE_THINKING}},
    )


async def _partner_turn(session: dict, founder_text: str) -> tuple[str, bool]:
    """Run the partner's turn. Returns (spoken_text, should_end_call)."""
    history = session["history"]
    history.append({"role": "user", "content": founder_text})

    should_end = False
    # Allow a couple of tool-call rounds before the spoken reply.
    for _ in range(4):
        resp = await _complete(history)
        msg = resp.choices[0].message
        tool_calls = getattr(msg, "tool_calls", None)

        if tool_calls:
            history.append(
                {
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                        }
                        for tc in tool_calls
                    ],
                }
            )
            for tc in tool_calls:
                name = tc.function.name
                if name == "end_call":
                    should_end = True
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                if name == "take_note":
                    session["notes"].append(args.get("note", ""))
                    result = {"ok": True, "noted": args.get("note", "")}
                elif name == "final_report":
                    session["verdict"] = args
                    result = {"ok": True, **args}
                else:  # end_call
                    result = {"ok": True}
                history.append(
                    {"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result)}
                )
            # Loop again to get the spoken line that follows the tool call(s).
            continue

        # Plain spoken turn — sanitize stage directions before it leaves the agent.
        text = _clean(msg.content or "")
        history.append({"role": "assistant", "content": text})
        return text, should_end

    # Fell through tool rounds without a clean spoken turn.
    return "Thanks — that's all I need. Good luck.", True


async def handle(websocket, *_):
    """*_ tolerates older websockets handler signature (websocket, path)."""
    sid = id(websocket)
    _sessions[sid] = {
        "history": [
            {"role": "system", "content": SYSTEM_INSTRUCTION},
            # Record that the partner already opened, so the model continues naturally.
            {"role": "assistant", "content": OPENING_LINE},
        ],
        "notes": [],
        "verdict": None,
    }
    logger.info(f"[cekura-ws] founder connected (session {sid})")
    try:
        await websocket.send(json.dumps({"content": OPENING_LINE}))
        async for raw in websocket:
            try:
                founder_text = json.loads(raw).get("content", "")
            except (json.JSONDecodeError, AttributeError):
                founder_text = str(raw)
            logger.info(f"[cekura-ws] founder: {founder_text!r}")
            text, should_end = await _partner_turn(_sessions[sid], founder_text)
            await websocket.send(json.dumps({"content": text}))
            logger.info(f"[cekura-ws] partner: {text!r} (end={should_end})")
            if should_end:
                await asyncio.sleep(0.2)  # let the closing line flush
                await websocket.close()
                break
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"[cekura-ws] founder disconnected (session {sid})")
    except Exception as e:  # never let one call take down the server
        logger.exception(f"[cekura-ws] error in session {sid}: {e}")
    finally:
        _sessions.pop(sid, None)


async def main():
    async with websockets.serve(handle, WS_HOST, WS_PORT, ping_interval=None):
        logger.info(f"[cekura-ws] listening on ws://{WS_HOST}:{WS_PORT}")
        logger.info(f"[cekura-ws] model={MODEL} thinking={_ENABLE_THINKING}")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
