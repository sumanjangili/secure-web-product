/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_AUDIT_LOG_ENDPOINT: string;
  readonly VITE_NETLIFY_CONTEXT: string;
  readonly VITE_ENABLE_EXPERIMENTAL_FEATURES: string;
  readonly VITE_DEBUG_MODE: string;
  // Add other VITE_ variables here if needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
