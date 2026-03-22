/**
 * Standalone entry point — runs the WebServer without Electron.
 *
 * IMPORTANT: Do NOT import src/common/adapter/main.ts anywhere in this file's
 * import tree. main.ts calls bridge.adapter() at load time; importing both
 * main.ts and standalone.ts in the same process would silently break the bridge.
 */

// register-node MUST be the first import — registers NodePlatformServices before any module-level code
import "./common/platform/register-node";

// Must follow registration — calls bridge.adapter() at module load time
import "./common/adapter/standalone";

import { initBridgeStandalone } from "./process/utils/initBridgeStandalone";
import { startWebServerWithInstance } from "./process/webserver";
import { cleanupWebAdapter } from "./process/webserver/adapter";
import initStorage from "./process/utils/initStorage";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const ALLOW_REMOTE = process.env.ALLOW_REMOTE === "true";

// Track server instance for shutdown (set by main() once server is ready)
let serverInstance: Awaited<
  ReturnType<typeof startWebServerWithInstance>
> | null = null;

// Register signal handlers at the TOP LEVEL — before any async operations — so
// they are always active regardless of where in the startup sequence a signal
// arrives. Registering them inside async main() risks a race where the signal
// fires before the await chain completes and the handlers are never registered.
const shutdown = (signal: string) => {
  console.log(`[server] Received ${signal}, shutting down...`);
  try {
    cleanupWebAdapter();
    if (serverInstance) {
      serverInstance.wss.clients.forEach((ws) => ws.terminate());
      serverInstance.wss.close();
      serverInstance.server.close(() => process.exit(0));
    }
  } catch (e) {
    console.error("[server] Shutdown error:", e);
  }
  // Force exit after 1 s regardless of connection state
  setTimeout(() => process.exit(0), 1000);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// bun run on macOS does not reliably deliver SIGINT to child-process JS handlers.
// As a guaranteed fallback: put stdin into raw mode and detect Ctrl+C (byte 0x03)
// directly. This works regardless of process-group topology or bun version.
// Only active in interactive sessions (stdin is a TTY); daemon/service mode
// (non-TTY stdin) uses only the signal handlers above.
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  // Restore terminal to cooked mode on exit so the parent shell is not broken
  process.on("exit", () => {
    try {
      process.stdin.setRawMode(false);
    } catch {
      // ignore — stdin may already be closed
    }
  });
  process.stdin.on("data", (chunk: Buffer) => {
    if (chunk[0] === 0x03) {
      // ETX (ASCII 3) = Ctrl+C in raw mode
      shutdown("Ctrl+C");
    }
  });
}

async function main(): Promise<void> {
  // Initialize storage (respects DATA_DIR env var)
  await initStorage();

  // Register all non-Electron bridge handlers
  await initBridgeStandalone();

  // Start the WebServer
  const instance = await startWebServerWithInstance(PORT, ALLOW_REMOTE);
  // Expose to the top-level shutdown handler
  serverInstance = instance;

  console.log(
    `[server] WebUI running on http://${ALLOW_REMOTE ? "0.0.0.0" : "localhost"}:${PORT}`,
  );
}

main().catch((err: unknown) => {
  console.error("[server] Fatal error:", err);
  process.exit(1);
});
