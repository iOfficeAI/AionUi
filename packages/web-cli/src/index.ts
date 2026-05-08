import { startBackend, startStaticServer } from '@aionui/web-host';
import type { BackendHandle, StaticServerHandle } from '@aionui/web-host';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let backendHandle: BackendHandle | null = null;
let staticHandle: StaticServerHandle | null = null;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'start';

  if (command === 'start') {
    console.log('Starting AionUi WebUI...');

    // 1. Resolve paths
    const cliRoot = resolve(__dirname, '..');
    const backendBinaryDir = resolve(cliRoot, 'bundled-aionui-backend', `${process.platform}-${process.arch}`);
    const staticDir = resolve(cliRoot, 'static');
    const dataDir = process.env.AIONUI_DATA_DIR || resolve(process.env.HOME || '/tmp', '.aionui');
    const logDir = process.env.AIONUI_LOG_DIR || resolve(dataDir, 'logs');

    // 2. Launch backend
    backendHandle = await startBackend({
      app: { name: 'AionUi', version: '0.0.0' },
      resolveBackend: async () => ({
        binaryPath: resolve(backendBinaryDir, process.platform === 'win32' ? 'aionui-backend.exe' : 'aionui-backend'),
        version: 'bundled',
      }),
      dataDir,
      logDir,
    });
    console.log(`✓ Backend started on port ${backendHandle.port}`);

    // 3. Start static server
    const port = parseInt(process.env.AIONUI_PORT || '3000', 10);
    staticHandle = await startStaticServer({
      staticDir,
      backendPort: backendHandle.port,
      port,
      allowRemote: process.env.AIONUI_ALLOW_REMOTE === '1',
      app: { name: 'AionUi', version: '0.0.0' },
    });
    console.log(`✓ Static server started: ${staticHandle.url}`);
    console.log('');
    console.log('AionUi WebUI is ready!');
    console.log(`Open ${staticHandle.url} in your browser.`);

    // 4. Handle shutdown signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } else if (command === 'version') {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    console.log(pkg.default.version);
  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Usage: aionui-web [start|version]');
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  if (staticHandle) await staticHandle.stop();
  if (backendHandle) await backendHandle.stop();
  console.log('Goodbye!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
