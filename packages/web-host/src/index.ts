import type { WebHostOptions, WebHostHandle } from './types.js';

export type { AppMetadata, BackendBinaryResolver, WebHostOptions, WebHostHandle, WebUIConfig } from './types.js';
export { resetPassword, changePassword, verifyPassword, loadConfig, saveConfig } from './auth/index.js';
export { startStaticServer, stopStaticServer } from './static-server.js';
export type { StaticServerOptions, StaticServerHandle } from './static-server.js';
export { SESSION_COOKIE } from './auth/session.js';
export { RateLimiter, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS } from './auth/rateLimiter.js';

// Backend launcher exports (M4)
export {
  BackendLifecycleManager,
  buildSpawnArgs,
  buildSpawnEnv,
  findAvailablePort,
  startBackend,
  stopBackend,
} from './backend-launcher.js';
export type {
  BackendDirConfig,
  BackendLaunchOptions,
  BackendHandle,
} from './backend-launcher.js';

/**
 * Start WebHost (main entry point)
 * Orchestrates backend-launcher (M4) + static-server (M5) + auth
 */
export async function startWebHost(opts: WebHostOptions): Promise<WebHostHandle> {
  const { readConfig } = await import('./auth/config.js');
  const { resetPassword: resetAuthPassword } = await import('./auth/index.js');
  const { startBackend } = await import('./backend-launcher.js');
  const { startStaticServer } = await import('./static-server.js');

  // 1. Load or initialize config
  const config = await readConfig(opts.app);
  let initialPassword: string | undefined;
  if (!config.passwordHash) {
    // First-run: generate random password
    const password = await resetAuthPassword({ app: opts.app });
    console.log(`[WebHost] Generated initial password: ${password}`);
    initialPassword = password;
    config.adminUsername = config.adminUsername || 'admin';
  }

  // 2. Start backend (M4)
  let backendHandle;
  if (opts.backend.kind === 'ownBackend') {
    backendHandle = await startBackend({
      app: opts.app,
      resolveBackend: opts.backend.resolveBackend,
      dataDir: opts.dataDir,
      logDir: opts.logDir,
      dirs: opts.dirs,
    });
  } else {
    // useExistingBackend: create a fake handle
    backendHandle = {
      port: opts.backend.port,
      stop: async () => {
        // no-op: external backend
      },
    };
  }

  let staticHandle;
  try {
    // 3. Start static-server (M5)
    staticHandle = await startStaticServer({
      staticDir: opts.staticDir,
      backendPort: backendHandle.port,
      port: opts.port ?? config.port,
      allowRemote: opts.allowRemote ?? config.allowRemote ?? false,
      app: opts.app,
    });
  } catch (err) {
    // If static-server fails, clean up backend
    await backendHandle.stop();
    throw err;
  }

  // 4. Return combined handle
  return {
    port: staticHandle.port,
    backendPort: backendHandle.port,
    url: staticHandle.url,
    localUrl: staticHandle.localUrl,
    networkUrl: staticHandle.networkUrl,
    lanIP: staticHandle.lanIP,
    initialPassword,
    async stop() {
      await staticHandle.stop();
      await backendHandle.stop();
    },
  };
}
