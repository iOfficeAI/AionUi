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
import initStorage from "./process/utils/initStorage";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const ALLOW_REMOTE = process.env.ALLOW_REMOTE === "true";

async function main(): Promise<void> {
  // Initialize storage (respects DATA_DIR env var)
  await initStorage();

  // Register all non-Electron bridge handlers
  await initBridgeStandalone();

  // Start the WebServer
  const instance = await startWebServerWithInstance(PORT, ALLOW_REMOTE);

  console.log(
    `[server] WebUI running on http://${ALLOW_REMOTE ? "0.0.0.0" : "localhost"}:${PORT}`,
  );

  // Graceful shutdown
  const shutdown = () => {
    console.log("[server] Shutting down...");
    instance.wss.clients.forEach((ws) =>
      ws.close(1000, "Server shutting down"),
    );
    instance.server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err: unknown) => {
  console.error("[server] Fatal error:", err);
  process.exit(1);
});
