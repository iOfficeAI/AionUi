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
  dataDir?: string;
  logDir?: string;
  dirs?: BackendSystemDirs;
  backend:
    | { kind: 'ownBackend'; resolveBackend: BackendBinaryResolver }
    | { kind: 'useExistingBackend'; port: number };
};

/**
 * Handle returned by startWebHost
 */
export type WebHostHandle = {
  port: number;
  backendPort: number;
  url: string;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  initialPassword?: string;
  stop: () => Promise<void>;
};

/**
 * WebUI configuration persisted to userDataPath/webui.config.json.
 *
 * Schema frozen in M5. Fields MUST NOT be renamed or removed in M6+; only
 * additive changes are allowed (with explicit migration notes in handoff).
 *
 * Design choice (M5): admin credentials live in this file under web-host's
 * control. The legacy webserver persisted the same user via backend SQLite;
 * M6 migration handles that transition at the desktop shell level.
 */
export type WebUIConfig = {
  /** bcrypt hash of the admin password. Empty string means "not initialized yet". */
  passwordHash: string;
  /** Admin username. Defaults to 'admin'. */
  adminUsername: string;
  /** Preferred server port. Optional; CLI / env override wins. */
  port?: number;
  /** Whether to allow remote (0.0.0.0) binding by default. */
  allowRemote?: boolean;
  /** ISO timestamp of last password change. For audit only. */
  passwordUpdatedAt?: string;
};
