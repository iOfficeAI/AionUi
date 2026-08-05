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
  hubDir?: string;
};

export type WebHostLarkAuthUser = {
  avatar?: string;
  email?: string;
  id: string;
  phone?: string;
  realname: string;
  username: string;
};

export type WebHostLarkQrLoginSession = {
  expiresIn: number;
  loginUrl: string;
  qrcodeId: string;
};

export type WebHostLarkQrLoginPollResult = {
  status: 'authenticated' | 'expired' | 'pending';
  user?: WebHostLarkAuthUser;
  personalModelSync?: {
    configured: number;
    failed: number;
    skipped: number;
    status: 'completed' | 'notAuthenticated' | 'partial' | 'unavailable';
  };
};

export type WebHostLarkAuthResult<T> =
  | { success: true; data: T }
  | { success: false; code: 'invalidResponse' | 'networkError' | 'serverError' };

/**
 * Lark authentication operations supplied by the host process.
 * GEA access tokens stay inside the host process and are never exposed here.
 */
export type WebHostLarkAuth = {
  createQrSession: () => Promise<WebHostLarkAuthResult<WebHostLarkQrLoginSession>>;
  logout?: () => Promise<void> | void;
  pollQrSession: (qrcodeId: string) => Promise<WebHostLarkAuthResult<WebHostLarkQrLoginPollResult>>;
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
  backend: { kind: 'ownBackend'; resolveBackend: BackendBinaryResolver } | { kind: 'useExistingBackend'; port: number };
  larkAuth?: WebHostLarkAuth;
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
  stop: () => Promise<void>;
};
