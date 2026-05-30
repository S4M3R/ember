import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Proxy the agent's SmallWebRTC signaling so the call is same-origin (no CORS).
    proxy: {
      "/agent": {
        target: "http://localhost:7860",
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/agent/, ""),
      },
    },
  },
});
