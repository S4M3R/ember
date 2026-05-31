// In-browser voice client. Connects to the Pipecat agent over SmallWebRTC so the
// whole call happens inside Ember (mic in, agent audio out, live transcript).

import { PipecatClient } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";

// The agent's SmallWebRTC offer endpoint. Default routes through the Vite dev
// proxy (/agent -> localhost:7860) to avoid CORS. Override with VITE_AGENT_URL.
export const AGENT_OFFER_URL =
  (import.meta.env.VITE_AGENT_URL as string) || "/agent/api/offer";

// Build a brand-new client (and transport) for each call. Reusing one whose
// peer connection died abnormally (mic glitch -> "Media stream error") leaves
// the transport unable to create a fresh offer, so the next call hangs in
// "connecting". A fresh transport per call avoids that entirely.
export function createCallClient(): PipecatClient {
  return new PipecatClient({
    transport: new SmallWebRTCTransport(),
    enableMic: true,
    enableCam: false,
  });
}

// Initial client for first mount.
export const callClient = createCallClient();
