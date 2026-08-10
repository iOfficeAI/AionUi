// Core types for @aionui/web-host (M3 interface contract, locked for M4-M8)

/**
 * App metadata injected by host environment (Electron or Node)
 */
export type AppMetadata = {
  version: string;
  isPackaged: boolean;
  resourcesPath: string;
  userDataPath: string;
};

/**
 * Backend binary resolver function injected by host environment
 */
export type BackendBinaryResolver = () => string;

/**
 * Authentication boundary enforced by AionCore.
 *
 * `local` is reserved for the trusted Electron process. Every browser-facing
 * host must use `webui`, even when only one account exists.
 */
export type BackendIdentityMode = 'local' | 'webui';

/**
 * System dirs exported to the backend via AIONUI_{CACHE,WORK,LOG}_DIR env.
 * Backend surfaces these on `/api/system/info`. Omit and the backend inherits
 * process.env, which may carry stale values from the parent shell — better to
 * be explicit.
 */
export type BackendSystemDirs = {
  cacheDir: string;
  workDir: string;
  logDir: string;
};

/**
 * Options for starting WebHost
 */
export type WebHostOptions = {
  app: AppMetadata;
  staticDir: string;
  port?: number;
  allowRemote?: boolean;
  trustProxy?: boolean;
  dataDir?: string;
  logDir?: string;
  dirs?: BackendSystemDirs;
  backend:
    | { kind: 'ownBackend'; resolveBackend: BackendBinaryResolver; identityMode: BackendIdentityMode }
    | { kind: 'useExistingBackend'; port: number; identityMode: BackendIdentityMode };
};

/**
 * Handle returned by startWebHost
 */
export type WebHostHandle = {
  port: number;
  backendPort: number;
  /** Present only for trusted Node callers that own a Local-mode backend. */
  localClientSecret?: string;
  url: string;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  stop: () => Promise<void>;
};
