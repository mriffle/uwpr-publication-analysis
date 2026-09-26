/// <reference types="vite/client" />

/** Build-time data path (docs/06 §13), injected by `define` in vite.config.ts. */
declare const __DATA_PATH__: string;

interface ImportMetaEnv {
  /** `'1'` builds the Funding impact view (`contract/config.ts` `fundingEnabled`, docs/09). */
  readonly VITE_FUNDING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
