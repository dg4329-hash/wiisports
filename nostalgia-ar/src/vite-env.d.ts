/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PINGPONG_URL?: string;
  readonly VITE_FRUIT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
