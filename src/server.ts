/**
 * Standalone entry point — runs the WebServer without Electron.
 *
 * IMPORTANT: Do NOT import src/common/adapter/main.ts anywhere in this file's
 * import tree. main.ts calls bridge.adapter() at load time; importing both
 * main.ts and standalone.ts in the same process would silently break the bridge.
 */

// register-node MUST be the first import — registers NodePlatformServices before any module-level code
import './common/platform/register-node';

// Must follow registration — calls bridge.adapter() at module load time
import './common/adapter/standalone';

import { initBridgeStandalone } from './process/utils/initBridgeStandalone';
import { startWebServerWithInstance } from './process/webserver';
import { cleanupWebAdapter } from './process/webserver/adapter';
import initStorage from './process/utils/initStorage';
import { ExtensionRegistry } from './process/extensions';
import { getChannelManager } from './process/channels';
import { closeDatabase } from './process/services/database/export';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const ALLOW_REMOTE = process.env.ALLOW_REMOTE === 'true';
const isResetPasswordMode = process.argv.includes('--resetpass');

// Track server instance for shutdown (set by main() once server is ready)
let serverInstance: Awaited<ReturnType<typeof startWebServerWithInstance>> | null = null;

// Guard against re-entrant shutdown (e.g. double CTRL+C)
let isShuttingDown = false;

// process.on('exit') is synchronous and fires on every exit path (including
// process.exit()). Use it as the final safety net to checkpoint the SQLite WAL
// so the database is never left in an inconsistent state.
process.on('exit', () => {
  closeDatabase();
});

// Register signal handlers at the TOP LEVEL — before any async operations — so
// they are always active regardless of where in the startup sequence a signal
// arrives. Registering them inside async main() risks a race where the signal
// fires before the await chain completes and the handlers are never registered.
const shutdown = (signal: string) => {
  if (isShuttingDown) {
    // Second signal: force-close the database and exit immediately
    console.log(`[server] Received second ${signal}, forcing exit...`);
    closeDatabase();
    process.exit(0);
    return;
  }
  isShuttingDown = true;
  console.log(`[server] Received ${signal}, shutting down...`);
  getChannelManager()
    .shutdown()
    .catch((e) => console.error('[server] ChannelManager shutdown error:', e))
    .finally(() => {
      try {
        cleanupWebAdapter();
        // Close the database explicitly so SQLite checkpoints the WAL file.
        // Also called from process.on('exit') as a safety net.
        closeDatabase();
        if (serverInstance) {
          serverInstance.wss.clients.forEach((ws) => ws.terminate());
          serverInstance.wss.close();
          serverInstance.server.close(() => process.exit(0));
        }
      } catch (e) {
        console.error('[server] Shutdown error:', e);
      }
      // Force exit after 1 s regardless of connection state
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

  // Initialize storage (respects DATA_DIR env var)
  await initStorage();

  // Initialize Extension Registry (scan and resolve all extensions)
  try {
    await ExtensionRegistry.getInstance().initialize();
  } catch (error) {
    console.error('[server] Failed to initialize ExtensionRegistry:', error);
  }

  // Initialize Channel subsystem
  try {
    await getChannelManager().initialize();
  } catch (error) {
    console.error('[server] Failed to initialize ChannelManager:', error);
  }

  // Register all non-Electron bridge handlers
  await initBridgeStandalone();

  // Start the WebServer
  const instance = await startWebServerWithInstance(PORT, ALLOW_REMOTE);
  // Expose to the top-level shutdown handler
  serverInstance = instance;

  console.log(`[server] WebUI running on http://${ALLOW_REMOTE ? '0.0.0.0' : 'localhost'}:${PORT}`);
}

main().catch((err: unknown) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
