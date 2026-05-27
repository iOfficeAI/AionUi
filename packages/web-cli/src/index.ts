import { startWebHost, startStaticServer } from '@aionui/web-host';
import type { WebHostHandle, StaticServerHandle } from '@aionui/web-host';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureAdminPassword } from './ensureAdminPassword.js';

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

// `isPackaged` mirrors AppMetadata.isPackaged: true when running as the
// bun-compiled single-file binary inside a release tarball. Only the
// resetpass hint text varies by mode today.
//
// Note on macOS quarantine: we tried stripping `com.apple.quarantine` from
// cliRoot at process start, but Gatekeeper refuses exec _before_ our code
// runs, so the first launch still fails. Users must either run
// `xattr -dr com.apple.quarantine <path>` manually or use `install-web.sh`,
// which does it for them. Until we sign + notarize, there is nothing the
// binary itself can do about first-launch quarantine.
const isPackaged = (() => {
  const exeName = path.basename(process.execPath).toLowerCase();
  return exeName === 'aionui-web' || exeName === 'aionui-web.exe';
})();

const BACKEND_BINARY = process.platform === 'win32' ? 'aioncore.exe' : 'aioncore';
const DEFAULT_PORT = 25808;
const RESET_COMMAND = isPackaged ? 'aionui-web resetpass' : 'bun run resetpass';

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

function resolveDataDir(flags: Map<string, string | true>): string {
  const override = flags.get('data-dir');
  if (typeof override === 'string') return path.resolve(override);
  const envOverride = process.env.AIONUI_DATA_DIR;
  if (envOverride) return path.resolve(envOverride);
  return path.join(os.homedir(), '.aionui-web');
}

function resolveLogDir(flags: Map<string, string | true>, dataDir: string): string {
  const override = flags.get('log-dir');
  if (typeof override === 'string') return path.resolve(override);
  const envOverride = process.env.AIONUI_LOG_DIR;
  if (envOverride) return path.resolve(envOverride);
  return path.join(dataDir, 'logs');
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

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(cliRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function runStart(flags: Map<string, string | true>): Promise<void> {
  const backendBin = resolveBackendBinary(flags);
  const staticDir = resolveStaticDir(flags);
  const dataDir = resolveDataDir(flags);
  fs.mkdirSync(dataDir, { recursive: true });
  const logDir = resolveLogDir(flags, dataDir);
  fs.mkdirSync(logDir, { recursive: true });
  const port = resolvePort(flags);
  const allowRemote = resolveAllowRemote(flags);
  const version = readPackageVersion();

  if (!fs.existsSync(staticDir)) {
    console.error(`[aionui-web] static dir not found: ${staticDir}`);
    console.error(`  hint: pass --static-dir <path> pointing to the SPA build output`);
    process.exit(1);
  }

  console.log(`[aionui-web] version    : ${version}`);
  console.log(`[aionui-web] data dir   : ${dataDir}`);
  console.log(`[aionui-web] log dir    : ${logDir}`);
  console.log(`[aionui-web] static dir : ${staticDir}`);
  console.log(`[aionui-web] backend bin: ${backendBin}`);
  console.log(`[aionui-web] launching  : port=${port} allowRemote=${allowRemote}`);

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
    });
    currentHandle = handle;

    console.log('');
    console.log('Chisel WebUI (frontend only) is ready');
    console.log(`  Local  : ${handle.localUrl}`);
    if (handle.networkUrl) console.log(`  Network: ${handle.networkUrl}`);
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
      dataDir,
      logDir,
      dirs: {
        cacheDir: dataDir,
        workDir: dataDir,
        logDir,
      },
      backend: {
        kind: 'ownBackend',
        resolveBackend: () => backendBin,
      },
    });

    currentHandle = handle;

    console.log('');
    console.log('Chisel WebUI is ready');
    console.log(`  Local  : ${handle.localUrl}`);
    if (handle.networkUrl) console.log(`  Network: ${handle.networkUrl}`);

    // First-launch bootstrap: if SQLite has no admin password yet, seed one via
    // backend and print plaintext credentials. Failure must not abort startup —
    // the user can always fall back to running resetpass manually.
    await ensureAdminPassword(
      { backendPort: handle.backendPort, resetCommand: RESET_COMMAND },
      {
        fetch: (...args) => fetch(...args),
        log: (msg) => console.log(msg),
        warn: (msg) => console.warn(msg),
        sleep: (ms) => delay(ms),
        now: () => Date.now(),
      }
    );

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
    backend: { kind: 'ownBackend', resolveBackend: () => backendBin },
  });
  currentHandle = handle;

  try {
    // Wait for backend to finish migrating + seeding before we hit the endpoint.
    const deadline = Date.now() + 15_000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${handle.backendPort}/api/auth/status`);
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
      console.error('[aionui-web] backend did not become ready within 15s');
      process.exit(1);
    }

    const res = await fetch(`http://127.0.0.1:${handle.backendPort}/api/webui/reset-password`, {
      method: 'POST',
    });
    if (!res.ok) {
      console.error(`[aionui-web] /api/webui/reset-password returned ${res.status}`);
      process.exit(1);
    }
    const payload = (await res.json()) as {
      data?: { new_password?: string; username?: string };
      new_password?: string;
      username?: string;
    };
    const newPassword = payload.data?.new_password ?? payload.new_password;
    const username = payload.data?.username ?? payload.username ?? 'admin';
    if (!newPassword) {
      console.error('[aionui-web] reset-password response missing new_password');
      process.exit(1);
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
  --data-dir <path>       Override data dir (default: ~/.aionui-web)
  --log-dir <path>        Override log dir (default: <data-dir>/logs)
  --static-dir <path>     Override static assets dir
  --backend-bin <path>    Override backend binary path

Options for resetpass:
  --data-dir <path>       Which data dir to reset (default: ~/.aionui-web)
  --backend-bin <path>    Override backend binary path

Environment variables:
  AIONUI_PORT, AIONUI_ALLOW_REMOTE, AIONUI_DATA_DIR, AIONUI_LOG_DIR,
  AIONUI_BACKEND_BIN
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
