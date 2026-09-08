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
  /** Existing GEA role grants, used for UI affordances only. No credentials. */
  permissionCodes?: string[];
  tenantId?: string;
  environmentId?: string;
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

/** Exact server-only Lark identity asserted after GEA verifies the QR login. */
export type WebHostLarkExternalIdentity = {
  provider: 'lark';
  issuer: string;
  tenant_id: string;
  subject: string;
};

export type WebHostLarkAuthResult<T> =
  | { success: true; data: T }
  | { success: false; code: 'invalidResponse' | 'networkError' | 'secureStorageUnavailable' | 'serverError' };

export type WebHostLarkAuthPoll = {
  identity?: WebHostLarkExternalIdentity;
  publicResult: WebHostLarkAuthResult<WebHostLarkQrLoginPollResult>;
};

export type WebHostGeaEnvironment = {
  baseUrl: string;
  editable: false;
  environmentId: string;
  source: 'default' | 'environment' | 'legacyEnvironment' | 'profile';
};

/**
 * Lark authentication operations supplied by the host process.
 * GEA access tokens stay inside the host process and are never exposed here.
 */
export type WebHostLarkAuth = {
  createQrSession: () => Promise<WebHostLarkAuthResult<WebHostLarkQrLoginSession>>;
  getEnvironment?: () => WebHostGeaEnvironment;
  pollQrSession: (qrcodeId: string) => Promise<WebHostLarkAuthPoll>;
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
  /** Server-only secret shared with the direct aioncore child. */
  coreSessionBootstrapSecret?: string;
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
