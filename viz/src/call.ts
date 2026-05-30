// In-browser voice client. Connects to the Pipecat agent over SmallWebRTC so the
// whole call happens inside Ember (mic in, agent audio out, live transcript).

import { PipecatClient } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";

// The agent's SmallWebRTC offer endpoint. Default routes through the Vite dev
// proxy (/agent -> localhost:7860) to avoid CORS. Override with VITE_AGENT_URL.
export const AGENT_OFFER_URL =
  (import.meta.env.VITE_AGENT_URL as string) || "/agent/api/offer";

export const callClient = new PipecatClient({
  transport: new SmallWebRTCTransport(),
  enableMic: true,
  enableCam: false,
});
