/**
 * Standalone entry point - runs the WebServer without Electron.
 *
 * IMPORTANT: Do NOT import src/common/adapter/main.ts anywhere in this file's
 * import tree. main.ts calls bridge.adapter() at load time; importing both
 * main.ts and standalone.ts in the same process would silently break the bridge.
 */

// register-node MUST be the first import - registers NodePlatformServices before any module-level code
import './common/platform/register-node';

// Must follow registration - calls bridge.adapter() at module load time
import './common/adapter/standalone';

import { closeDatabase } from './process/services/database/export';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const ALLOW_REMOTE = process.env.ALLOW_REMOTE === 'true';
const isResetPasswordMode = process.argv.includes('--resetpass');

type WebServerInstance = {
  server: import('http').Server;
  wss: import('ws').WebSocketServer;
};

let serverInstance: WebServerInstance | null = null;
let cleanupWebAdapterFn: (() => void) | null = null;
let shutdownChannelsFn: (() => Promise<void>) | null = null;
let isShuttingDown = false;

process.on('exit', () => {
  closeDatabase();
});

const shutdown = (signal: string) => {
  if (isShuttingDown) {
    console.log(`[server] Received second ${signal}, forcing exit...`);
    closeDatabase();
    process.exit(0);
    return;
  }

  isShuttingDown = true;
  console.log(`[server] Received ${signal}, shutting down...`);

  (shutdownChannelsFn?.() ?? Promise.resolve())
    .catch((error) => console.error('[server] ChannelManager shutdown error:', error))
    .finally(() => {
      try {
        cleanupWebAdapterFn?.();
        closeDatabase();

        if (serverInstance) {
          serverInstance.wss.clients.forEach((ws) => ws.terminate());
          serverInstance.wss.close();
          serverInstance.server.close(() => process.exit(0));
        }
      } catch (error) {
        console.error('[server] Shutdown error:', error);
      }

      setTimeout(() => process.exit(0), 1000);
    });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function main(): Promise<void> {
  if (isResetPasswordMode) {
    const { resetPasswordCLI, resolveResetPasswordUsername } = await import('./process/utils/resetPasswordCLI');
    const username = resolveResetPasswordUsername(process.argv);
    await resetPasswordCLI(username);
    process.exit(0);
    return;
  }

  const [
    { default: initStorage },
    { ExtensionRegistry },
    channelsModule,
    { initBridgeStandalone },
    webserverModule,
    { ApiCallbackManager },
  ] = await Promise.all([
    import('./process/utils/initStorage'),
    import('./process/extensions'),
    import('./process/channels'),
    import('./process/utils/initBridgeStandalone'),
    import('./process/webserver'),
    import('./process/services/ApiCallbackManager'),
  ]);

  const { cleanupWebAdapter } = await import('./process/webserver/adapter');
  cleanupWebAdapterFn = cleanupWebAdapter;
  shutdownChannelsFn = () => channelsModule.getChannelManager().shutdown();

  await initStorage();
  // Standalone server mode does not go through initializeProcess(), so register callbacks here too.
  ApiCallbackManager.getInstance();

  try {
    await ExtensionRegistry.getInstance().initialize();
  } catch (error) {
    console.error('[server] Failed to initialize ExtensionRegistry:', error);
  }

  try {
    await channelsModule.getChannelManager().initialize();
  } catch (error) {
    console.error('[server] Failed to initialize ChannelManager:', error);
  }

  await initBridgeStandalone();

  const instance = await webserverModule.startWebServerWithInstance(PORT, ALLOW_REMOTE);
  serverInstance = instance;

  console.log(`[server] WebUI running on http://${ALLOW_REMOTE ? '0.0.0.0' : 'localhost'}:${PORT}`);
}

main().catch((err: unknown) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
