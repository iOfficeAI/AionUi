import { startWebHost, startStaticServer } from '@aionui/web-host';
import type { WebHostHandle, StaticServerHandle } from '@aionui/web-host';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowserUrl, shouldAutoOpenBrowser } from './browser.js';
import { resolveDataDir, resolveLogDir, resolveWorkDir } from './paths.js';

// tarball layout:
//   aionui-web/
//   ├── aionui-web              ← bun-compiled standalone binary (process.execPath)
//   ├── package.json             ← for runtime version lookup
//   ├── bundled-aioncore/<plat-arch>/aioncore[.exe]
//   └── static/                  ← SPA assets
//
// Under `bun build --compile`, import.meta.url resolves to a virtual /$bunfs/
// path, NOT the real tarball location — we MUST use process.execPath to find
// sibling files. In dev (tsx/node), process.execPath is the node/bun binary,
// so fall back to import.meta.url there.
function resolveCliRoot(): string {
  // Heuristic: if the executable path ends in "aionui-web" or "aionui-web.exe",
  // treat it as the packaged single-file binary and return its directory.
  const exe = process.execPath;
  const exeName = path.basename(exe).toLowerCase();
  if (exeName === 'aionui-web' || exeName === 'aionui-web.exe') {
    return path.dirname(exe);
  }
  // Dev mode (tsx/node/bun running from source): use import.meta.url
  const __filename = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(__filename), '..');
}

const cliRoot = resolveCliRoot();

const BACKEND_BINARY = process.platform === 'win32' ? 'aioncore.exe' : 'aioncore';
const DEFAULT_PORT = 25808;

let currentHandle: WebHostHandle | StaticServerHandle | null = null;

function parseArgs(argv: string[]): { command: string; flags: Map<string, string | true> } {
  const [command = 'start', ...rest] = argv;
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith('--')) {
      flags.set(name, next);
      i++;
    } else {
      flags.set(name, true);
    }
  }
  return { command, flags };
}

function resolveBackendBinary(flags: Map<string, string | true>): string {
  const override = flags.get('backend-bin');
  if (typeof override === 'string') return path.resolve(override);
  const envOverride = process.env.AIONUI_BACKEND_BIN;
  if (envOverride) return path.resolve(envOverride);
  const platArch = `${process.platform}-${process.arch}`;
  const bundled = path.join(cliRoot, 'bundled-aioncore', platArch, BACKEND_BINARY);
  return bundled;
}

function resolveStaticDir(flags: Map<string, string | true>): string {
  const override = flags.get('static-dir');
  if (typeof override === 'string') return path.resolve(override);
  return path.join(cliRoot, 'static');
}

function resolvePort(flags: Map<string, string | true>): number {
  const cli = flags.get('port');
  if (typeof cli === 'string' && /^\d+$/.test(cli)) return Number(cli);
  const env = process.env.AIONUI_PORT ?? process.env.PORT;
  if (env && /^\d+$/.test(env)) return Number(env);
  return DEFAULT_PORT;
}

function resolveAllowRemote(flags: Map<string, string | true>): boolean {
  if (flags.has('remote')) return true;
  const env = process.env.AIONUI_ALLOW_REMOTE ?? process.env.AIONUI_REMOTE;
  if (!env) return false;
  return ['1', 'true', 'yes', 'on'].includes(env.trim().toLowerCase());
}

function resolveTrustProxy(flags: Map<string, string | true>): boolean {
  if (flags.has('trust-proxy')) return true;
  const env = process.env.AIONUI_TRUST_PROXY;
  if (!env) return false;
  return ['1', 'true', 'yes', 'on'].includes(env.trim().toLowerCase());
}

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(cliRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function printInitialAdminCredentialHint(dataDir: string): void {
  const configured = process.env.AIONUI_INITIAL_ADMIN_CREDENTIALS_FILE?.trim();
  const credentialFile = configured || path.join(dataDir, 'initial-admin-credentials.json');
  if (!fs.existsSync(credentialFile)) return;

  console.log(`  Initial credentials: ${credentialFile}`);
  console.log('  Sign in with that one-time password and replace it immediately.');
}

async function runStart(flags: Map<string, string | true>): Promise<void> {
  const backendBin = resolveBackendBinary(flags);
  const staticDir = resolveStaticDir(flags);
  const dataDir = resolveDataDir(flags);
  fs.mkdirSync(dataDir, { recursive: true });
  const logDir = resolveLogDir(flags, dataDir);
  fs.mkdirSync(logDir, { recursive: true });
  const workDir = resolveWorkDir(flags, dataDir);
  fs.mkdirSync(workDir, { recursive: true });
  const port = resolvePort(flags);
  const allowRemote = resolveAllowRemote(flags);
  const trustProxy = resolveTrustProxy(flags);
  const version = readPackageVersion();
  const autoOpenBrowser = shouldAutoOpenBrowser({
    allowRemote,
    env: process.env,
    openFlag: flags.has('open'),
    noOpenFlag: flags.has('no-open'),
  });

  if (!fs.existsSync(staticDir)) {
    console.error(`[aionui-web] static dir not found: ${staticDir}`);
    console.error(`  hint: pass --static-dir <path> pointing to the SPA build output`);
    process.exit(1);
  }

  console.log(`[aionui-web] version    : ${version}`);
  console.log(`[aionui-web] data dir   : ${dataDir}`);
  console.log(`[aionui-web] log dir    : ${logDir}`);
  console.log(`[aionui-web] work dir   : ${workDir}`);
  console.log(`[aionui-web] static dir : ${staticDir}`);
  console.log(`[aionui-web] backend bin: ${backendBin}`);
  console.log(`[aionui-web] launching  : port=${port} allowRemote=${allowRemote} trustProxy=${trustProxy}`);

  const backendAvailable = fs.existsSync(backendBin);

  if (!backendAvailable) {
    // Graceful degradation: serve the SPA shell without spawning backend.
    // API calls from the browser will 502/ECONNREFUSED — frontend is expected
    // to surface this to the user (e.g. "backend missing" banner).
    console.warn('');
    console.warn('⚠️  Backend binary not found — starting in FRONTEND-ONLY mode.');
    console.warn(`   Missing: ${backendBin}`);
    console.warn('   The web UI will load but API calls will fail until a backend is available.');
    console.warn('   To enable backend: download aioncore and set AIONUI_BACKEND_BIN.');
    console.warn('');

    const handle = await startStaticServer({
      staticDir,
      backendPort: 0, // invalid port → API proxy will fail cleanly
      port,
      allowRemote,
      trustProxy,
    });
    currentHandle = handle;

    console.log('');
    console.log('AionUi WebUI (frontend only) is ready');
    console.log(`  Local  : ${handle.localUrl}`);
    if (handle.networkUrl) console.log(`  Network: ${handle.networkUrl}`);
    if (autoOpenBrowser) {
      const openResult = openBrowserUrl(handle.localUrl);
      if (openResult.ok) {
        console.log(`[aionui-web] opened ${handle.localUrl} in your browser.`);
      } else {
        console.warn(`[aionui-web] could not open the browser automatically: ${openResult.reason}`);
      }
    }
    console.log('');
    console.log('Press Ctrl+C to stop.');
  } else {
    const handle = await startWebHost({
      app: {
        version,
        isPackaged: true,
        resourcesPath: cliRoot,
        userDataPath: dataDir,
      },
      staticDir,
      port,
      allowRemote,
      trustProxy,
      dataDir,
      logDir,
      dirs: {
        cacheDir: dataDir,
        workDir,
        logDir,
      },
      backend: {
        kind: 'ownBackend',
        resolveBackend: () => backendBin,
        identityMode: 'webui',
      },
    });

    currentHandle = handle;

    console.log('');
    console.log('AionUi WebUI is ready');
    console.log(`  Local  : ${handle.localUrl}`);
    if (handle.networkUrl) console.log(`  Network: ${handle.networkUrl}`);
    printInitialAdminCredentialHint(dataDir);

    if (autoOpenBrowser) {
      const openResult = openBrowserUrl(handle.localUrl);
      if (openResult.ok) {
        console.log(`[aionui-web] opened ${handle.localUrl} in your browser.`);
      } else {
        console.warn(`[aionui-web] could not open the browser automatically: ${openResult.reason}`);
      }
    }

    console.log('');
    console.log('Press Ctrl+C to stop.');
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[aionui-web] received ${signal}, stopping...`);
    try {
      if (currentHandle) await currentHandle.stop();
    } catch (err) {
      console.error('[aionui-web] stop failed:', err);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

/**
 * `aionui-web resetpass` — spin up the backend just long enough to POST
 * /api/webui/reset-password, print the new plaintext password, then tear down.
 * Uses the same data-dir resolution as `start`, so the reset targets whichever
 * DB the user normally runs against.
 */
async function runResetPassword(flags: Map<string, string | true>): Promise<void> {
  const backendBin = resolveBackendBinary(flags);
  if (!fs.existsSync(backendBin)) {
    console.error(`[aionui-web] backend binary not found: ${backendBin}`);
    console.error('  hint: pass --backend-bin <path> or set AIONUI_BACKEND_BIN');
    process.exit(1);
  }
  const dataDir = resolveDataDir(flags);
  fs.mkdirSync(dataDir, { recursive: true });
  const logDir = resolveLogDir(flags, dataDir);
  fs.mkdirSync(logDir, { recursive: true });
  const staticDir = resolveStaticDir(flags);
  const version = readPackageVersion();

  console.log(`[aionui-web] resetting admin password in ${dataDir}`);

  const handle = await startWebHost({
    app: {
      version,
      isPackaged: true,
      resourcesPath: cliRoot,
      userDataPath: dataDir,
    },
    // resetpass only needs the backend up; serve static anyway so the web-host
    // does not choke on a missing staticDir.
    staticDir,
    // Use an ephemeral port (0) so a concurrent running instance does not clash.
    port: 0,
    allowRemote: false,
    dataDir,
    logDir,
    dirs: { cacheDir: dataDir, workDir: dataDir, logDir },
    backend: { kind: 'ownBackend', resolveBackend: () => backendBin, identityMode: 'local' },
  });
  currentHandle = handle;

  try {
    const localClientHeaders = handle.localClientSecret
      ? { 'x-aionui-local-secret': handle.localClientSecret }
      : undefined;
    // Wait for backend to finish migrating + seeding before we hit the endpoint.
    const deadline = Date.now() + 15_000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${handle.backendPort}/api/auth/status`, {
          headers: localClientHeaders,
        });
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        /* backend still booting */
      }
      await delay(500);
    }
    if (!ready) {
      throw new Error('backend did not become ready within 15s');
    }

    const res = await fetch(`http://127.0.0.1:${handle.backendPort}/api/webui/reset-password`, {
      method: 'POST',
      headers: localClientHeaders,
    });
    if (!res.ok) {
      throw new Error(`/api/webui/reset-password returned ${res.status}`);
    }
    const payload = (await res.json()) as {
      data?: { new_password?: string; username?: string };
      new_password?: string;
      username?: string;
    };
    const newPassword = payload.data?.new_password ?? payload.new_password;
    const username = payload.data?.username ?? payload.username ?? 'admin';
    if (!newPassword) {
      throw new Error('reset-password response missing new_password');
    }
    console.log(`[aionui-web] username: ${username}`);
    console.log(`[aionui-web] new password: ${newPassword}`);
    console.log('[aionui-web] existing sessions have been invalidated.');
  } finally {
    try {
      await handle.stop();
    } catch {
      /* best-effort shutdown */
    }
    currentHandle = null;
  }
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command === '--version' || command === 'version' || command === '-v') {
    console.log(readPackageVersion());
    return;
  }

  if (command === '--help' || command === 'help' || command === '-h') {
    console.log(`Usage: aionui-web <command> [options]

Commands:
  start              Start the WebUI (default)
  resetpass          Reset the admin password and print the new one
  version            Print version
  help               Show this help

Options for start:
  --port <n>              Listen port (default: ${DEFAULT_PORT})
  --remote                Bind 0.0.0.0 instead of 127.0.0.1
  --trust-proxy           Trust one reverse-proxy hop for client IP and host
  --open                  Force opening the local URL in a browser
  --no-open               Disable automatic browser opening
  --data-dir <path>       Override data dir (default: ~/.aionui-web)
  --log-dir <path>        Override log dir (default: <data-dir>/logs)
  --work-dir <path>       Override workspace root (default: <data-dir>)
  --static-dir <path>     Override static assets dir
  --backend-bin <path>    Override backend binary path

Options for resetpass:
  --data-dir <path>       Which data dir to reset (default: ~/.aionui-web)
  --backend-bin <path>    Override backend binary path

Environment variables:
  AIONUI_PORT, AIONUI_ALLOW_REMOTE, AIONUI_DATA_DIR, AIONUI_LOG_DIR, AIONUI_WORK_DIR,
  AIONUI_BACKEND_BIN, AIONUI_OPEN_BROWSER, AIONUI_TRUST_PROXY, AIONUI_HTTPS,
  AIONUI_BOOTSTRAP_WORKSPACE, AIONUI_INITIAL_ADMIN_USERNAME,
  AIONUI_INITIAL_ADMIN_PASSWORD_FILE, AIONUI_INITIAL_ADMIN_CREDENTIALS_FILE
`);
    return;
  }

  if (command === 'resetpass') {
    await runResetPassword(flags);
    return;
  }

  if (command !== 'start') {
    console.error(`Unknown command: ${command}`);
    console.error('Usage: aionui-web [start|resetpass|version|help]');
    process.exit(1);
  }

  await runStart(flags);
}

main().catch((err: Error) => {
  console.error('[aionui-web] fatal:', err.message);
  if (currentHandle) void currentHandle.stop().catch(() => undefined);
  process.exit(1);
});
