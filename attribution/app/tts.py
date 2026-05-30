"""Gradium TTS client — re-synthesize a turn's spoken text in a chosen voice.

The agent pipeline streams TTS over a websocket (see pipecat's GradiumTTSService).
For the viz we want a one-shot "say this same line in a different voice": connect,
send setup + text + end_of_stream, collect the streamed PCM, and wrap it into a WAV
the browser can play. Real only — if Gradium errors or is unreachable, we raise.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import wave

from websockets.asyncio.client import connect

from . import config


class TTSUnavailable(RuntimeError):
    """Gradium TTS could not produce audio (missing key, bad voice, or network)."""


def _pcm_to_wav(pcm: bytes, sample_rate: int) -> bytes:
    """Wrap raw mono 16-bit PCM into a WAV container."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)  # 16-bit
        w.setframerate(sample_rate)
        w.writeframes(pcm)
    return buf.getvalue()


async def synthesize(text: str, voice: str) -> dict:
    """Synthesize `text` with Gradium voice `voice`.

    Returns {voice, audio (data: WAV URL), sample_rate, duration_ms}.
    Raises TTSUnavailable on any failure so the UI shows a real error.
    """
    text = (text or "").strip()
    if not text:
        raise TTSUnavailable("nothing to synthesize (empty text)")
    if not config.GRADIUM_API_KEY:
        raise TTSUnavailable("GRADIUM_API_KEY is not set")

    headers = {"x-api-key": config.GRADIUM_API_KEY, "x-api-source": "ember"}
    req_id = "ember-resynth"
    pcm = bytearray()
    try:
        async with connect(config.GRADIUM_TTS_URL, additional_headers=headers) as ws:
            await ws.send(json.dumps({
                "type": "setup",
                "output_format": "pcm",
                "voice_id": voice,
                "close_ws_on_eos": False,
                "client_req_id": req_id,
            }))
            await ws.send(json.dumps({"type": "text", "text": text, "client_req_id": req_id}))
            await ws.send(json.dumps({"type": "end_of_stream", "client_req_id": req_id}))

            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=config.REQUEST_TIMEOUT_S)
                msg = json.loads(raw)
                kind = msg.get("type")
                if kind == "audio":
                    pcm += base64.b64decode(msg["audio"])
                elif kind == "end_of_stream":
                    break
                elif kind == "error":
                    raise TTSUnavailable(str(msg.get("message", msg)))
                # "ready" / "text" (word timestamps) — ignore.
    except TTSUnavailable:
        raise
    except (asyncio.TimeoutError, OSError, Exception) as e:  # noqa: BLE001 — surface as 502
        raise TTSUnavailable(f"{type(e).__name__}: {e}")

    if not pcm:
        raise TTSUnavailable("Gradium returned no audio")

    wav = _pcm_to_wav(bytes(pcm), config.GRADIUM_SAMPLE_RATE)
    duration_ms = int(len(pcm) / 2 / config.GRADIUM_SAMPLE_RATE * 1000)  # 16-bit mono
    return {
        "voice": voice,
        "audio": "data:audio/wav;base64," + base64.b64encode(wav).decode("ascii"),
        "sample_rate": config.GRADIUM_SAMPLE_RATE,
        "duration_ms": duration_ms,
    }
