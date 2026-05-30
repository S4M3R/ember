import { PipecatClientAudio, PipecatClientProvider } from "@pipecat-ai/client-react";
import { IconContext } from "@phosphor-icons/react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { callClient } from "./call";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <IconContext.Provider value={{ size: 16, weight: "duotone", color: "currentColor" }}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <PipecatClientProvider client={callClient as any}>
        <App />
        <PipecatClientAudio />
      </PipecatClientProvider>
    </IconContext.Provider>
  </React.StrictMode>,
);
