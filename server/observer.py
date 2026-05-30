"""Ember frame observer for Pipecat.

Attach this to your Pipecat pipeline. It assembles one Turn per user->agent
exchange and broadcasts it over the WS hub, so the viz lights up live as you talk.

Frame class names are matched by string, so this survives most Pipecat version
churn. If a turn never appears, print `type(frame).__name__` in on_push_frame and
adjust the names below to match your version (see server/INTEGRATION.md). You can
also bypass frame introspection entirely and call `record_turn(...)` yourself.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import time
import uuid
import wave

import httpx

# Nemotron can't do native function calls on this endpoint, so after each turn we
# run a fast guided_json side-call to decide the partner's tool actions (notes,
# final report, end), and surface them as real tool events on the timeline.
# Env is read lazily (the agent calls load_dotenv after importing this module).
def _nem_url() -> str:
    return os.getenv("NEMOTRON_LLM_URL", "").rstrip("/")


def _nem_model() -> str:
    return os.getenv("NEMOTRON_LLM_MODEL", "nvidia/nemotron-3-super")


_EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "notes": {"type": "array", "items": {"type": "string"}},
        "end": {"type": "boolean"},
        "report": {
            "type": ["object", "null"],
            "properties": {"verdict": {"type": "string"}, "reasons": {"type": "string"}},
        },
    },
    "required": ["notes", "end"],
}
_EXTRACT_SYS = (
    "You log a YC partner's tool actions during rapid office hours. Given the founder's "
    "last message and the partner's reply, decide: "
    "notes = 1-2 short third-person notes capturing anything concrete the founder said about "
    "their startup (what they're building, who the user is, traction/revenue, the ask, or a "
    "red flag). Take a note whenever the founder states a real fact about their company. "
    "Only return [] when the founder said nothing substantive (greeting, filler, 'um'). "
    "end = true if the partner is wrapping up or ending the call (says goodbye, 'we're done', "
    "'ending this call', 'come back when…'), or the founder clearly isn't ready. "
    "report = a {verdict, reasons} object only if the partner is giving a final verdict, "
    "else null. Output JSON only."
)


async def _extract_tools_nemotron(user_text: str, response: str) -> dict:
    body = {
        "model": _nem_model(),
        "messages": [
            {"role": "system", "content": _EXTRACT_SYS},
            {"role": "user", "content": f"FOUNDER: {user_text}\nPARTNER: {response}"},
        ],
        "temperature": 0,
        "max_tokens": 220,
        "chat_template_kwargs": {"enable_thinking": False},
        "guided_json": _EXTRACT_SCHEMA,
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{_nem_url()}/chat/completions", json=body, timeout=20)
        r.raise_for_status()
        return json.loads(r.json()["choices"][0]["message"]["content"])

# Debug capture: with EMBER_DEBUG=1 the observer dumps every frame (name +
# timestamp + key fields) to a JSONL, plus the stereo recording WAV + audio chunk
# metadata, so a single call gives everything needed to debug timing and audio.
_DEBUG = os.getenv("EMBER_DEBUG", "").lower() in ("1", "true", "yes")
_FRAMES_PATH = "/tmp/ember-frames.jsonl"
_REC_PATH = "/tmp/ember-rec.wav"
_AUDIO_META_PATH = "/tmp/ember-audio-meta.json"
_AUDIO_FRAME_NAMES = ("InputAudioRawFrame", "TTSAudioRawFrame", "OutputAudioRawFrame",
                      "UserAudioRawFrame", "AudioRawFrame")


def _wav_b64(pcm: bytes, sample_rate: int, channels: int = 1) -> str:
    """16-bit PCM bytes -> base64 data: URL the browser can play."""
    if not pcm:
        return ""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm)
    return "data:audio/wav;base64," + base64.b64encode(buf.getvalue()).decode()


def _short(v, n=140):
    """Compact string for a tool-call's args/result (for the timeline tooltip)."""
    if v is None:
        return None
    try:
        s = v if isinstance(v, str) else json.dumps(v, default=str)
    except Exception:
        s = str(v)
    return s[:n]


REC_RATE = 16000  # master rate for the mono call recording


def _lay_stream(chunks: list, np) -> "any":
    """Lay one audio stream into a continuous int16 array.

    Each chunk = (offset_seconds, sample_rate, pcm_bytes). We lock to the stream's
    dominant sample rate (kills accidental double-capture at two rates), resample to
    REC_RATE, and place each chunk at max(its arrival offset, a write cursor) so
    chunks NEVER overlap — bursty TTS plays back contiguously at real speed, and real
    gaps (silence) are preserved. This is what fixes the garbled audio.
    """
    import collections

    if not chunks:
        return np.zeros(0, dtype=np.int16)
    rate0 = collections.Counter(r for _, r, _ in chunks).most_common(1)[0][0]
    placed = []
    cursor = 0
    for off, rate, b in chunks:
        if rate != rate0:
            continue
        s = np.frombuffer(b, dtype=np.int16)
        if rate != REC_RATE and len(s):
            n_out = max(1, int(len(s) * REC_RATE / rate))
            s = np.interp(
                np.linspace(0.0, 1.0, n_out, endpoint=False),
                np.linspace(0.0, 1.0, len(s), endpoint=False),
                s,
            ).astype(np.int16)
        idx = max(int(off * REC_RATE), cursor)
        placed.append((idx, s))
        cursor = idx + len(s)
    track = np.zeros(cursor, dtype=np.int16)
    for idx, s in placed:
        track[idx : idx + len(s)] = s
    return track


def _mono_wav_b64(caller_chunks: list, agent_chunks: list) -> tuple[str, int]:
    """Mix caller + agent into one mono recording of the call. Simple and robust."""
    import numpy as np

    left = _lay_stream(caller_chunks, np)
    right = _lay_stream(agent_chunks, np)
    n = max(len(left), len(right))
    if n == 0:
        return "", 0
    mono = np.zeros(n, dtype=np.int32)
    mono[: len(left)] += left
    mono[: len(right)] += right
    np.clip(mono, -32768, 32767, out=mono)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(REC_RATE)
        w.writeframes(mono.astype(np.int16).tobytes())
    return "data:audio/wav;base64," + base64.b64encode(buf.getvalue()).decode(), int(n / REC_RATE * 1000)

try:
    # server/ ships a SYSTEM_BLOCKS constant; the agent ships build_blocks() and
    # always passes blocks explicitly, so an empty default is fine there.
    from ember_prompt import SYSTEM_BLOCKS
except Exception:
    SYSTEM_BLOCKS = []

try:
    from pipecat.observers.base_observer import BaseObserver
except Exception:  # pipecat not installed (e.g. running mock_feed only)
    class BaseObserver:  # type: ignore
        pass


class EmberObserver(BaseObserver):
    def __init__(self, hub, system_blocks: list[dict] | None = None):
        try:
            super().__init__()
        except Exception:
            pass
        self.hub = hub
        self.system_blocks = system_blocks or SYSTEM_BLOCKS
        # Set by the bot to actually hang up when side-extraction decides end==True
        # (Nemotron can't call the real end_call tool). Called once, after the
        # agent's closing line has been spoken. Async, takes no args.
        self.on_tool_end = None
        self._ended = False
        self.history: list[dict] = []   # prior {role, content} messages
        self.index = 0
        self.session = uuid.uuid4().hex[:6]  # unique per connection -> no id collisions
        self.call_start = time.time()   # reference t0 for the real-time timeline
        # Caller audio is buffered across the gap between turns (cleared after each
        # turn is emitted), so it must live outside the per-turn _reset().
        self.input_buf = bytearray()    # caller mic audio since last turn (echo-free)
        self.user_sr = 16000
        self.agent_speaking = False     # true between TTS start/stop -> don't buffer (echo)
        # Full-call stereo recording: (offset_sec, rate, pcm_bytes) per channel.
        self.rec_caller: list = []
        self.rec_agent: list = []
        self._seen_ids: set = set()     # dedup: observer sees each frame once per hop
        if _DEBUG:
            try:
                open(_FRAMES_PATH, "w").close()  # fresh dump per connection
            except Exception:
                pass
        self._reset()

    def _reset(self):
        self.user_text: str | None = None
        self.parts: list[str] = []
        # Real wall-clock timestamps for each pipeline stage this turn.
        self.t_stt_start = None         # first caller audio of the utterance
        self.t_speech_start = None      # VAD: user started speaking
        self.t_speech_end = None        # VAD: user stopped speaking
        self.t_user = self.t_llm0 = self.t_llm1 = self.t_tts0 = None
        self.tts_pcm = bytearray()      # agent voice (TTS output)
        self.tts_sr = 24000
        self.tool_events = []           # [{name, t0, t1, args, result}] this turn

    def _dbg(self, name, now, frame):
        if not _DEBUG or name in _AUDIO_FRAME_NAMES:
            return  # audio frames are summarized in the audio-meta file, not logged
        rec = {"t": round(now - self.call_start, 3), "f": name}
        if "Transcription" in name:
            rec["text"] = getattr(frame, "text", "")
        try:
            with open(_FRAMES_PATH, "a") as f:
                f.write(json.dumps(rec) + "\n")
        except Exception:
            pass

    async def on_push_frame(self, data):
        frame = getattr(data, "frame", data)
        # The observer fires once per processor hop, so the SAME frame arrives
        # many times. Process each frame id exactly once.
        fid = getattr(frame, "id", None)
        if fid is not None:
            if fid in self._seen_ids:
                return
            self._seen_ids.add(fid)
            if len(self._seen_ids) > 40000:
                self._seen_ids.clear()
        name = type(frame).__name__
        now = time.time()
        self._dbg(name, now, frame)

        if name == "TranscriptionFrame":               # final STT result
            seg = (getattr(frame, "text", "") or "").strip()
            if seg:
                # One spoken answer can arrive as several finals ("I'm building
                # Salto." / "and it's for" / "Boise engineers."). Join them into
                # one turn instead of overwriting — otherwise only the last
                # fragment reaches the timeline.
                self.user_text = f"{self.user_text} {seg}" if self.user_text else seg
                if self.t_stt_start is None:
                    self.t_stt_start = now
                self.t_user = now
                await self._broadcast_partial(now)     # STT appears live
        elif name == "UserStartedSpeakingFrame":       # VAD: speech onset
            # First onset of the turn — keep it so the STT bar spans the whole
            # utterance, not just the last fragment.
            if self.t_speech_start is None:
                self.t_speech_start = now
        elif name == "UserStoppedSpeakingFrame":       # VAD: speech offset
            self.t_speech_end = now                     # latest offset of the turn
        elif name == "LLMFullResponseStartFrame":
            self.t_llm0 = now
            self.parts = []
            self.tts_pcm = bytearray()                  # fresh agent utterance
        elif name in ("LLMTextFrame", "TextFrame"):     # assistant tokens
            txt = getattr(frame, "text", "") or ""
            if txt:
                self.parts.append(txt)
        elif name == "LLMFullResponseEndFrame":
            self.t_llm1 = now
            await self._broadcast_partial(now)         # LLM appears live
        elif name == "FunctionCallInProgressFrame":     # a tool call started
            fn = getattr(frame, "function_name", None) or "tool"
            self.tool_events.append({
                "name": fn, "t0": now, "t1": None,
                "args": _short(getattr(frame, "arguments", None)), "result": None,
            })
            await self._broadcast_partial(now)          # tool appears live
        elif name == "FunctionCallResultFrame":         # a tool call returned
            fn = getattr(frame, "function_name", None) or "tool"
            res = _short(getattr(frame, "result", None))
            for te in reversed(self.tool_events):
                if te["name"] == fn and te["t1"] is None:
                    te["t1"] = now
                    te["result"] = res
                    break
            await self._broadcast_partial(now)
        elif name == "InputAudioRawFrame":              # caller mic audio
            audio = getattr(frame, "audio", b"") or b""
            sr = getattr(frame, "sample_rate", self.user_sr)
            # Buffer caller audio EXCEPT while the agent is speaking (that's echo
            # of the agent's own voice picked up by the mic). Same gate feeds the
            # left channel of the stereo recording, keeping it echo-free.
            if not self.agent_speaking and audio:
                if not self.input_buf:
                    self.t_stt_start = now
                self.input_buf += audio
                self.user_sr = sr
                cap = self.user_sr * 2 * 8
                if len(self.input_buf) > cap:
                    self.input_buf = self.input_buf[-cap:]
                self.rec_caller.append((now - self.call_start, sr, audio))
        elif name == "TTSAudioRawFrame":                # agent voice audio
            audio = getattr(frame, "audio", b"") or b""
            sr = getattr(frame, "sample_rate", self.tts_sr)
            self.tts_pcm += audio
            self.tts_sr = sr
            if audio:
                self.rec_agent.append((now - self.call_start, sr, audio))
        elif name in ("BotStartedSpeakingFrame", "TTSStartedFrame"):
            # Agent starts speaking. Wrap the whole utterance with Bot start/stop
            # so a multi-sentence reply (several TTSStarted/Stopped) is one turn.
            first = self.t_tts0 is None
            if first:
                self.t_tts0 = now
            self.agent_speaking = True                  # stop buffering caller (echo)
            if first:
                await self._broadcast_partial(now)     # TTS bar appears live (speaking)
        elif name == "BotStoppedSpeakingFrame":
            # Agent has fully finished speaking -> the real TTS end + emit point.
            self.agent_speaking = False                 # resume buffering caller
            await self._emit(now)

    def _trace(self, now):
        def off(t):
            return int((t - self.call_start) * 1000) if t else None
        stt_start = self.t_speech_start or self.t_stt_start
        stt_end = self.t_speech_end or self.t_user
        # No transcription -> no STT block (e.g. the greeting, which is LLM+TTS only).
        if stt_end is None:
            stt_start = None
        # TTS end grows in real time while the agent is still speaking.
        tts_end = now if self.agent_speaking else self.t_llm1
        return {
            "stt": [off(stt_start), off(stt_end)],
            "llm": [off(self.t_llm0), off(self.t_llm1)],
            "tts": [off(self.t_tts0), off(tts_end if self.t_tts0 else None)],
        }

    def _tool_calls(self, now):
        def off(t):
            return int((t - self.call_start) * 1000) if t else None
        return [{
            "name": te["name"],
            "t0": off(te["t0"]),
            "t1": off(te["t1"] or now),   # still-open tool grows to now
            "args": te.get("args"),
            "result": te.get("result"),
        } for te in self.tool_events]

    async def _broadcast_partial(self, now):
        """Broadcast the turn-in-progress so the timeline fills stage-by-stage in
        real time. The viz updates the turn by id; the final emit replaces it with
        the complete data (messages, audio, etc.)."""
        turn = {
            "id": f"{self.session}-t{self.index}",
            "index": self.index,
            "ts": now,
            "user_text": self.user_text or "",
            "response": "".join(self.parts).strip(),
            "system_blocks": self.system_blocks,
            "messages": [],
            "latencies": {},
            "trace": self._trace(now),
            "tool_calls": self._tool_calls(now),
            "stt_confidence": None,
            "partial": True,
            "now_ms": int((now - self.call_start) * 1000),  # live call clock
            "tts_speaking": self.agent_speaking,            # grow the TTS bar while True
            "audio_user": "",
            "audio_agent": "",
        }
        await self.hub.broadcast({"type": "turn", "turn": turn})

    async def _emit(self, now: float):
        resp = "".join(self.parts).strip()
        # Emit on any agent reply, even with no user turn — that's the greeting,
        # so it shows up on the timeline (LLM + TTS, no STT).
        if resp:
            turn = await self.record_turn(self.user_text or "", resp, now)
            # Nemotron can't call tools natively, so fire a background guided_json
            # side-call to decide the partner's tool actions for this turn.
            asyncio.create_task(self._extract_tools(turn))
        self._reset()
        # Update the full-call recording after every agent utterance (incl. the
        # greeting), so "play call" works even before the first user turn.
        await self._broadcast_recording()

    async def _extract_tools(self, turn):
        """Background: ask Nemotron (guided_json) which tools the partner used this
        turn, then re-broadcast the turn with real tool events on the TOOL track."""
        if not _nem_url() or not turn:
            return
        try:
            data = await _extract_tools_nemotron(
                turn.get("user_text", ""), turn.get("response", ""))
        except Exception as e:  # noqa: BLE001 - best-effort
            print(f"[ember] tool-extract FAILED: {e!r}", flush=True)
            return
        print(f"[ember] tool-extract: {data}", flush=True)
        notes = data.get("notes") or []
        report = data.get("report")
        end = bool(data.get("end"))
        base = (turn.get("trace", {}).get("llm") or [None, None])[1] or turn.get("now_ms") or 0
        tcs, t = [], base
        for note in notes[:2]:
            if not note:
                continue
            tcs.append({"name": "take_note", "t0": t, "t1": t + 150,
                        "args": str(note)[:140], "result": "noted"})
            t += 240
        if report:
            tcs.append({"name": "final_report", "t0": t, "t1": t + 150,
                        "args": json.dumps(report)[:140], "result": report.get("verdict", "")})
            t += 240
        if end:
            tcs.append({"name": "end_call", "t0": t, "t1": t + 150, "args": "", "result": "ended"})
        if tcs:
            out = dict(turn)
            out["tool_calls"] = tcs
            await self.hub.broadcast({"type": "turn", "turn": out})
        # Actually hang up. _emit fires on BotStoppedSpeaking (the goodbye has
        # finished playing), so end shortly after — just enough to flush the last
        # audio packet on the client before the transport tears down.
        if end and self.on_tool_end and not self._ended:
            self._ended = True
            print("[ember] end intent -> hanging up", flush=True)
            await asyncio.sleep(0.6)
            try:
                await self.on_tool_end()
            except Exception as e:  # noqa: BLE001 - best-effort hangup
                print(f"[ember] hangup failed: {e!r}", flush=True)

    async def _broadcast_recording(self):
        try:
            url, dur = _mono_wav_b64(self.rec_caller, self.rec_agent)
            if url:
                await self.hub.broadcast({"type": "recording", "audio": url, "duration_ms": dur})
            if _DEBUG and url:
                with open(_REC_PATH, "wb") as f:
                    f.write(base64.b64decode(url.split(",", 1)[1]))

                def summarize(chunks):
                    if not chunks:
                        return {}
                    rates = sorted({r for _, r, _ in chunks})
                    audio_ms = sum((len(b) // 2) / r * 1000 for _, r, b in chunks)
                    last = chunks[-1]
                    span = (last[0] + (len(last[2]) // 2) / last[1]) - chunks[0][0]
                    return {"chunks": len(chunks), "rates": rates, "audio_ms": round(audio_ms),
                            "span_s": round(span, 2), "first_t": round(chunks[0][0], 2)}
                with open(_AUDIO_META_PATH, "w") as f:
                    json.dump({"caller": summarize(self.rec_caller),
                               "agent": summarize(self.rec_agent), "duration_ms": dur}, f)
        except Exception:  # noqa: BLE001 - recording is best-effort
            pass

    async def record_turn(self, user_text: str, response: str, now: float | None = None,
                          tool_calls: list | None = None):
        """Build a Turn and broadcast it. Call directly if you skip frame parsing."""
        now = now or time.time()
        def ms(a, b):
            return int((b - a) * 1000) if a and b else 0
        latencies = {
            "stt_ms": ms(self.t_user, self.t_llm0),
            "llm_ms": ms(self.t_llm0, self.t_llm1),
            "tts_ms": ms(self.t_tts0, now),
            "total_ms": ms(self.t_user, now),
        }
        # Real wall-clock offsets (ms from call start) for each pipeline stage.
        # STT block uses VAD speech boundaries when available (the user's actual
        # speech), falling back to the audio-buffer window.
        def off(t):
            return int((t - self.call_start) * 1000) if t else None
        stt_start = self.t_speech_start or self.t_stt_start
        stt_end = self.t_speech_end or self.t_user
        if stt_end is None:        # greeting / no transcription -> no STT block
            stt_start = None
        trace = {
            "stt": [off(stt_start), off(stt_end)],
            "llm": [off(self.t_llm0), off(self.t_llm1)],
            "tts": [off(self.t_tts0), off(now)],
        }
        # No empty user message for the greeting (no caller turn).
        messages = list(self.history)
        if user_text:
            messages.append({"role": "user", "content": user_text})
        turn = {
            "id": f"{self.session}-t{self.index}",
            "index": self.index,
            "ts": now,
            "user_text": user_text,
            "response": response,
            "system_blocks": self.system_blocks,
            "messages": messages,
            "latencies": latencies,
            "trace": trace,
            "tool_calls": self._tool_calls(now),
            "stt_confidence": None,
            "partial": False,
            "now_ms": int((now - self.call_start) * 1000),
            "tts_speaking": False,                          # closed: real TTS end is set
            "audio_user": _wav_b64(bytes(self.input_buf), self.user_sr),
            "audio_agent": _wav_b64(bytes(self.tts_pcm), self.tts_sr),
        }
        self.input_buf = bytearray()    # consumed -> fresh buffer for next turn
        if user_text:
            self.history.append({"role": "user", "content": user_text})
        self.history.append({"role": "assistant", "content": response})
        self.index += 1
        await self.hub.broadcast({"type": "turn", "turn": turn})
        return turn
