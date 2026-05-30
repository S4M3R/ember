import { RTVIEvent } from "@pipecat-ai/client-js";
import { usePipecatClient } from "@pipecat-ai/client-react";
import { Microphone, MicrophoneSlash, Phone, PhoneSlash } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AGENT_OFFER_URL } from "../call";
import type { Turn } from "../types";
import { YcLogo } from "./YcLogo";

type LiveMsg = { role: "user" | "assistant"; text: string };

// BotTtsText streams word-level chunks with no spaces ("How","can","I",...).
// Re-join them with spaces, but not before punctuation/contractions or right
// after an opening bracket/quote, so "well" + "," + "thanks." -> "well, thanks."
function appendChunk(acc: string, chunk: string): string {
  if (!acc) return chunk;
  const endsOpen = /[([{"'‘“\s]$/.test(acc);
  const startsClose = /^[\s.,!?;:)\]}%…'"’”-]/.test(chunk);
  return acc + (endsOpen || startsClose ? "" : " ") + chunk;
}

function errText(e: any): string {
  if (e == null) return "unknown error";
  if (typeof e === "string") return e;
  const m = e.message || e.error?.message || e.reason || e.data?.message || e.data?.error;
  if (m) return String(m);
  try {
    const s = JSON.stringify(e);
    return s && s !== "{}" ? s : String(e);
  } catch {
    return String(e);
  }
}

export function Transcript({
  turns,
  activeTurnId,
  onPickTurn,
}: {
  turns: Turn[];
  activeTurnId?: string;
  onPickTurn: (turnId: string) => void;
}) {
  const client = usePipecatClient();
  const [state, setState] = useState("disconnected");
  const [msgs, setMsgs] = useState<LiveMsg[]>([]);
  const [interim, setInterim] = useState("");
  const [muted, setMuted] = useState(false);
  const [botSpeaking, setBotSpeaking] = useState(false);
  // Tracks whether the current assistant message is still open for appending
  // TTS chunks. Reset whenever the bot starts/stops a fresh utterance.
  const botOpenRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, msgs.length, msgs[msgs.length - 1]?.text, interim]);

  useEffect(() => {
    const onState = (s: unknown) => setState(String(s));
    const onUser = (d: any) => {
      if (d?.final) {
        // A new user turn closes any open assistant message.
        botOpenRef.current = false;
        setMsgs((m) => [...m, { role: "user", text: d.text }]);
        setInterim("");
      } else {
        setInterim(d?.text ?? "");
      }
    };
    // Real-time disclosure of what the agent is actually saying: BotTtsText
    // streams the spoken text chunk-by-chunk as TTS plays it.
    const onBotStart = () => {
      botOpenRef.current = false; // next chunk begins a fresh assistant message
      setBotSpeaking(true);
    };
    const onBotTts = (d: any) => {
      const t: string = d?.text ?? "";
      if (!t) return;
      setBotSpeaking(true);
      setMsgs((m) => {
        const last = m[m.length - 1];
        if (botOpenRef.current && last?.role === "assistant") {
          return [...m.slice(0, -1), { role: "assistant", text: appendChunk(last.text, t) }];
        }
        botOpenRef.current = true;
        return [...m, { role: "assistant", text: t }];
      });
    };
    const onBotStop = () => {
      botOpenRef.current = false;
      setBotSpeaking(false);
    };
    const onErr = (e: unknown) => {
      console.error("[ember] call error event:", e);
      setState("error: " + errText(e));
    };
    client.on(RTVIEvent.TransportStateChanged, onState);
    client.on(RTVIEvent.UserTranscript, onUser);
    client.on(RTVIEvent.BotTtsStarted, onBotStart);
    client.on(RTVIEvent.BotTtsText, onBotTts);
    client.on(RTVIEvent.BotTtsStopped, onBotStop);
    client.on(RTVIEvent.Error, onErr);
    client.on(RTVIEvent.MessageError, onErr);
    client.on(RTVIEvent.DeviceError, onErr);
    return () => {
      client.off(RTVIEvent.TransportStateChanged, onState);
      client.off(RTVIEvent.UserTranscript, onUser);
      client.off(RTVIEvent.BotTtsStarted, onBotStart);
      client.off(RTVIEvent.BotTtsText, onBotTts);
      client.off(RTVIEvent.BotTtsStopped, onBotStop);
      client.off(RTVIEvent.Error, onErr);
      client.off(RTVIEvent.MessageError, onErr);
      client.off(RTVIEvent.DeviceError, onErr);
    };
  }, [client]);

  const connecting = ["connecting", "authenticating", "initializing"].includes(state);
  const connected = ["connected", "ready"].includes(state);
  const inCall = connected || connecting || msgs.length > 0;

  // Keep mute UI in sync: once the call drops, the mic is back on by default.
  useEffect(() => {
    if (!connected && !connecting) setMuted(false);
  }, [connected, connecting]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    client.enableMic(!next); // mic on when not muted
  }

  async function toggle() {
    if (connected || connecting) {
      await client.disconnect();
      return;
    }
    setMsgs([]);
    setInterim("");
    setMuted(false);
    setBotSpeaking(false);
    botOpenRef.current = false;
    try {
      // SmallWebRTC expects webrtcRequestParams.endpoint (the /api/offer URL).
      await client.connect({ webrtcRequestParams: { endpoint: AGENT_OFFER_URL } } as any);
    } catch (e) {
      console.error("[ember] call connect failed:", e);
      setState("error: " + errText(e));
    }
  }

  return (
    <div className="transcript">
      <div className="col-head">
        <span>Live transcript</span>
        <div className="call-controls">
          {(connected || connecting) && (
            <button
              className={`call-btn ${muted ? "muted" : ""}`}
              onClick={toggleMute}
              disabled={!connected}
              title={muted ? "Unmute your mic" : "Mute your mic"}
            >
              {muted ? <MicrophoneSlash weight="fill" /> : <Microphone weight="fill" />}
              {muted ? "Unmute" : "Mute"}
            </button>
          )}
          <button className={`call-btn ${connected ? "on" : ""}`} onClick={toggle}>
            <span className={`call-dot ${connected ? "live" : connecting ? "wait" : ""}`} />
            {connected || connecting ? <PhoneSlash weight="fill" /> : <Phone weight="fill" />}
            {connected || connecting ? "End call" : "Start call"}
          </button>
        </div>
      </div>

      <div className="callee">
        <YcLogo size={22} />
        <div className="callee-who">
          <div className="callee-name">YC Partner</div>
          <div className="callee-sub">office hours · voice agent</div>
        </div>
        <span className={`callee-state ${connected ? "on" : ""}`}>
          {connected ? "on the line" : connecting ? "dialing…" : "not connected"}
        </span>
      </div>

      {state.startsWith("error") && <div className="call-err">{state}</div>}

      <div className="transcript-list">
        {inCall ? (
          <>
            {msgs.map((m, i) => {
              const speaking = m.role === "assistant" && botSpeaking && i === msgs.length - 1;
              return (
                <div key={i} className={`bubble ${m.role}`}>
                  <span className="bubble-role">
                    {m.role === "user" ? "You" : <><YcLogo size={11} /> YC Partner</>}
                  </span>
                  <span className="bubble-body">
                    {m.text}
                    {speaking && <span className="caret" />}
                  </span>
                </div>
              );
            })}
            {interim && (
              <div className="bubble user interim">
                <span className="bubble-role">User</span>
                <span className="bubble-body">{interim}…</span>
              </div>
            )}
            {connected && msgs.length === 0 && !interim && (
              <div className="empty">Connected — pitch your startup.</div>
            )}
            {connecting && <div className="empty">connecting to the YC partner…</div>}
          </>
        ) : (
          <AnimatePresence initial={false}>
            {turns.map((t) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bubbles ${activeTurnId === t.id ? "active" : ""}`}
                onClick={() => onPickTurn(t.id)}
              >
                <div className="bubble user">
                  <span className="bubble-role">User</span>
                  <span className="bubble-body">{t.user_text}</span>
                </div>
                <div className="bubble assistant">
                  <span className="bubble-role"><YcLogo size={11} /> YC Partner</span>
                  <span className="bubble-body">{t.response}</span>
                </div>
              </motion.div>
            ))}
            {turns.length === 0 && (
              <div className="empty">Press Start call to talk to the YC partner.</div>
            )}
          </AnimatePresence>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
