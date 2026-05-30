/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOCK?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_ATTRIBUTION_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
