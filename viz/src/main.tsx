import { RTVIEvent } from "@pipecat-ai/client-js";
import { PipecatClientAudio, PipecatClientProvider } from "@pipecat-ai/client-react";
import { IconContext } from "@phosphor-icons/react";
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { callClient, createCallClient } from "./call";
import "./styles.css";

// Hand each call a pristine client: after a call ends, swap in a fresh one so the
// next call (e.g. a "resume from here") gets a clean transport. Reusing a
// transport whose peer connection died abnormally leaves it stuck "connecting".
function CallRoot() {
  const [client, setClient] = useState(callClient);
  const wasConnected = useRef(false);

  useEffect(() => {
    const onState = (s: unknown) => {
      const st = String(s);
      if (["connected", "ready"].includes(st)) {
        wasConnected.current = true;
      } else if (["disconnected", "error"].includes(st) && wasConnected.current) {
        wasConnected.current = false;
        // Replace the spent client with a fresh one for the next call.
        setClient(createCallClient());
      }
    };
    client.on(RTVIEvent.TransportStateChanged, onState);
    return () => {
      client.off(RTVIEvent.TransportStateChanged, onState);
    };
  }, [client]);

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <PipecatClientProvider client={client as any}>
      <App />
      <PipecatClientAudio />
    </PipecatClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <IconContext.Provider value={{ size: 16, weight: "duotone", color: "currentColor" }}>
      <CallRoot />
    </IconContext.Provider>
  </React.StrictMode>,
);
