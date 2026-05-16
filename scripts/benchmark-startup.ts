/**
 * Electron Cold Startup Benchmark
 *
 * Launches the Electron app N times and measures per-phase startup timings by
 * parsing the electron-log file for [AionUi:ready] / [AionUi:init] /
 * [AionUi:process] marks, plus `ready-to-show` / `did-finish-load` /
 * time-to-interactive (chat input visible).
 *
 * Optional `--with-memory` mode samples RSS / heap in the main and renderer
 * processes at three checkpoints (idle, afterConversation, afterClose) to
 * estimate per-conversation memory pressure and leaks.
 *
 * Usage:
 *   bunx tsx scripts/benchmark-startup.ts [--iterations 5] [--cooldown 2000]
 *   bunx tsx scripts/benchmark-startup.ts --with-memory
 */
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ── CLI args ────────────────────────────────────────────────────────────────

type Args = {
  iterations: number;
  cooldownMs: number;
  launchTimeoutMs: number;
  interactiveTimeoutMs: number;
  outputJson: string | null;
  withMemory: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {
    iterations: 5,
    cooldownMs: 2_000,
    launchTimeoutMs: 90_000,
    interactiveTimeoutMs: 60_000,
    outputJson: null,
    withMemory: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === '--iterations' && next) {
      args.iterations = parseInt(next, 10);
      i++;
    } else if (flag === '--cooldown' && next) {
      args.cooldownMs = parseInt(next, 10);
      i++;
    } else if (flag === '--launch-timeout' && next) {
      args.launchTimeoutMs = parseInt(next, 10);
      i++;
    } else if (flag === '--interactive-timeout' && next) {
      args.interactiveTimeoutMs = parseInt(next, 10);
      i++;
    } else if (flag === '--output' && next) {
      args.outputJson = next;
      i++;
    } else if (flag === '--with-memory') {
      args.withMemory = true;
    }
  }

  if (!Number.isFinite(args.iterations) || args.iterations < 1) args.iterations = 5;
  return args;
}

// ── Types ───────────────────────────────────────────────────────────────────

type MainMemorySample = {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
};

type RendererMemorySample = {
  usedSize: number;
  totalSize: number;
};

type MemorySnapshot = {
  main: MainMemorySample | null;
  renderer: RendererMemorySample | null;
  takenAt: string;
};

type MemoryProfile = {
  idle: MemorySnapshot | null;
  afterConversation: MemorySnapshot | null;
  afterClose: MemorySnapshot | null;
  // Leak estimate = afterClose - idle (main RSS + renderer usedSize)
  leakMainRssBytes: number;
  leakRendererUsedBytes: number;
  // Convenience deltas (afterConversation - idle)
  openDeltaMainRssBytes: number;
  openDeltaRendererUsedBytes: number;
};

type StartupTiming = {
  iteration: number;
  timestamp: string;
  failed: boolean;
  failureReason: string | null;
  // Wall-clock measurements from Playwright side
  wallFirstWindowMs: number;
  wallDomContentLoadedMs: number;
  wallTimeToInteractiveMs: number;
  wallTotalMs: number;
  // Parsed from [AionUi:ready] marks
  readyInitializeProcessMs: number;
  readyInitializeZoomFactorMs: number;
  readyCreateWindowMs: number;
  readyInitializeAcpDetectorMs: number;
  // Parsed from [AionUi:init] marks
  initTotalMs: number;
  // Parsed from [AionUi:process] marks
  processInitStorageMs: number;
  processExtensionRegistryMs: number;
  processChannelManagerMs: number;
  // Parsed from window lifecycle logs
  logRendererDidFinishLoadPresent: boolean;
  logWindowReadyToShowPresent: boolean;
  logShowingMainWindowPresent: boolean;
  // Optional memory profile (only when --with-memory is passed)
  memory: MemoryProfile | null;
};

// ── Selectors ───────────────────────────────────────────────────────────────

const GUID_INPUT = '.guid-input-card-shell textarea';
const AGENT_PILL = '[data-agent-pill="true"]';

// ── Log file helpers ────────────────────────────────────────────────────────

function getLogFilePath(): string {
  const today = new Date().toISOString().slice(0, 10);
  const candidates: string[] = [];
  if (process.platform === 'darwin') {
    candidates.push(
      path.join(os.homedir(), 'Library', 'Logs', 'AionUi-Dev', `${today}.log`),
      path.join(os.homedir(), 'Library', 'Logs', 'AionUi', `${today}.log`)
    );
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    candidates.push(path.join(appData, 'AionUi', 'logs', `${today}.log`));
  } else {
    candidates.push(path.join(os.homedir(), '.config', 'AionUi', 'logs', `${today}.log`));
  }
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

function getLogFileSize(logPath: string): number {
  try {
    return fs.statSync(logPath).size;
  } catch {
    return 0;
  }
}

function readNewLogLines(logPath: string, offset: number): string[] {
  try {
    const currentSize = fs.statSync(logPath).size;
    if (currentSize <= offset) return [];
    const fd = fs.openSync(logPath, 'r');
    const buf = Buffer.alloc(currentSize - offset);
    fs.readSync(fd, buf, 0, buf.length, offset);
    fs.closeSync(fd);
    return buf.toString('utf-8').split('\n');
  } catch {
    return [];
  }
}

// ── Log parsing ─────────────────────────────────────────────────────────────

// Matches: [AionUi:ready] <label> +<ms>ms
// Matches: [AionUi:init]  <label> +<ms>ms
// Matches: [AionUi:process] <label> +<ms>ms
const MARK_REGEX = /\[AionUi:(ready|init|process)\]\s+([^+]+?)\s+\+(\d+)ms/;

type ParsedMarks = {
  ready: Map<string, number>;
  init: Map<string, number>;
  process: Map<string, number>;
  logs: { rendererDidFinishLoad: boolean; windowReadyToShow: boolean; showingMainWindow: boolean };
};

function parseStartupLog(lines: string[]): ParsedMarks {
  const marks: ParsedMarks = {
    ready: new Map(),
    init: new Map(),
    process: new Map(),
    logs: { rendererDidFinishLoad: false, windowReadyToShow: false, showingMainWindow: false },
  };

  for (const line of lines) {
    const m = MARK_REGEX.exec(line);
    if (m) {
      const [, scope, label, msStr] = m;
      const ms = parseInt(msStr, 10);
      const key = label.trim();
      if (scope === 'ready') marks.ready.set(key, ms);
      else if (scope === 'init') marks.init.set(key, ms);
      else if (scope === 'process') marks.process.set(key, ms);
      continue;
    }

    if (line.includes('[AionUi] Renderer did-finish-load')) marks.logs.rendererDidFinishLoad = true;
    else if (line.includes('[AionUi] Window ready-to-show')) marks.logs.windowReadyToShow = true;
    else if (line.includes('[AionUi] Showing main window')) marks.logs.showingMainWindow = true;
  }

  return marks;
}

// ── App launch ──────────────────────────────────────────────────────────────

function getProjectRoot(): string {
  // In a git worktree, __dirname points to the worktree which has no build output.
  // Resolve the main repo root via git's common dir so Electron can find out/main/index.js.
  try {
    const { execSync } = require('child_process');
    const commonDir = execSync('git rev-parse --git-common-dir', {
      encoding: 'utf-8',
      cwd: path.resolve(__dirname, '..'),
    }).trim();
    const mainRoot = path.resolve(commonDir, '..');
    if (fs.existsSync(path.join(mainRoot, 'out/main/index.js'))) {
      return mainRoot;
    }
  } catch {
    // not in a worktree or git not available
  }
  return path.resolve(__dirname, '..');
}

async function launchApp(timeoutMs: number, withMemory: boolean): Promise<ElectronApplication> {
  const projectRoot = getProjectRoot();

  // Ensure production build exists
  const mainEntry = path.join(projectRoot, 'out/main/index.js');
  if (!fs.existsSync(mainEntry)) {
    console.log('[bench:startup] Building production bundle (electron-vite build)...');
    const { execSync } = require('child_process');
    execSync('npx electron-vite build', { cwd: projectRoot, stdio: 'inherit' });
  }

  const launchArgs = withMemory ? [mainEntry, '--js-flags=--expose-gc'] : [mainEntry];
  return electron.launch({
    args: launchArgs,
    cwd: projectRoot,
    env: {
      ...process.env,
      AIONUI_DISABLE_AUTO_UPDATE: '1',
      AIONUI_E2E_TEST: '1',
      AIONUI_DISABLE_DEVTOOLS: '1',
      AIONUI_CDP_PORT: '0',
      NODE_ENV: 'production',
    },
    timeout: timeoutMs,
  });
}

async function resolveMainWindow(app: ElectronApplication, timeoutMs: number): Promise<Page> {
  const existing = app.windows().find((w) => !w.url().startsWith('devtools://'));
  if (existing) {
    await existing.waitForLoadState('domcontentloaded');
    return existing;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = Math.max(250, deadline - Date.now());
    const win = await app.waitForEvent('window', { timeout: Math.min(1_000, remaining) }).catch(() => null);
    if (win && !win.url().startsWith('devtools://')) {
      await win.waitForLoadState('domcontentloaded');
      return win;
    }
  }
  throw new Error('Failed to resolve main window within timeout');
}

// ── Memory sampling ─────────────────────────────────────────────────────────

async function sampleMainMemory(app: ElectronApplication): Promise<MainMemorySample | null> {
  try {
    return await app.evaluate(async () => {
      const gc = (globalThis as { gc?: () => void }).gc;
      if (typeof gc === 'function') {
        gc();
        gc();
      }
      const m = process.memoryUsage();
      return {
        rss: m.rss,
        heapTotal: m.heapTotal,
        heapUsed: m.heapUsed,
        external: m.external,
        arrayBuffers: m.arrayBuffers,
      };
    });
  } catch {
    return null;
  }
}

async function sampleRendererMemory(page: Page): Promise<RendererMemorySample | null> {
  try {
    const client = await page.context().newCDPSession(page);
    try {
      await client.send('HeapProfiler.enable').catch(() => {});
      await client.send('HeapProfiler.collectGarbage').catch(() => {});
      const heap = (await client.send('Runtime.getHeapUsage')) as { usedSize: number; totalSize: number };
      return { usedSize: heap.usedSize, totalSize: heap.totalSize };
    } finally {
      await client.detach().catch(() => {});
    }
  } catch {
    return null;
  }
}

async function takeSnapshot(app: ElectronApplication, page: Page): Promise<MemorySnapshot> {
  // Let pending microtasks settle before sampling
  await new Promise((r) => setTimeout(r, 500));
  const [main, renderer] = await Promise.all([sampleMainMemory(app), sampleRendererMemory(page)]);
  return { main, renderer, takenAt: new Date().toISOString() };
}

function computeMemoryDeltas(
  idle: MemorySnapshot | null,
  afterConversation: MemorySnapshot | null,
  afterClose: MemorySnapshot | null
): Pick<
  MemoryProfile,
  'leakMainRssBytes' | 'leakRendererUsedBytes' | 'openDeltaMainRssBytes' | 'openDeltaRendererUsedBytes'
> {
  const idleRss = idle?.main?.rss ?? 0;
  const idleRenderer = idle?.renderer?.usedSize ?? 0;
  const convRss = afterConversation?.main?.rss ?? 0;
  const convRenderer = afterConversation?.renderer?.usedSize ?? 0;
  const closeRss = afterClose?.main?.rss ?? 0;
  const closeRenderer = afterClose?.renderer?.usedSize ?? 0;

  return {
    leakMainRssBytes: closeRss > 0 && idleRss > 0 ? closeRss - idleRss : 0,
    leakRendererUsedBytes: closeRenderer > 0 && idleRenderer > 0 ? closeRenderer - idleRenderer : 0,
    openDeltaMainRssBytes: convRss > 0 && idleRss > 0 ? convRss - idleRss : 0,
    openDeltaRendererUsedBytes: convRenderer > 0 && idleRenderer > 0 ? convRenderer - idleRenderer : 0,
  };
}

// ── Conversation open/close actions ─────────────────────────────────────────

/**
 * Open a conversation by clicking the first available agent pill on the guid page.
 * Does not send a message; waits until the pill enters the `data-agent-selected`
 * state. Returns true if a pill was successfully selected.
 */
async function openConversation(page: Page, timeoutMs: number): Promise<boolean> {
  try {
    const pill = page.locator(AGENT_PILL).first();
    await pill.waitFor({ state: 'visible', timeout: timeoutMs });
    await pill.click();
    // Wait for the selected state to indicate the agent is ready
    await page.waitForSelector(`${AGENT_PILL}[data-agent-selected="true"]`, { timeout: timeoutMs }).catch(() => {});
    // Also wait for the textarea to become interactive (agent probe finished)
    await page
      .locator(GUID_INPUT)
      .first()
      .waitFor({ state: 'visible', timeout: timeoutMs })
      .catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Close the current conversation by navigating back to the guid landing page.
 * This mirrors the user gesture of returning to "new chat" without picking an agent.
 */
async function closeConversation(page: Page): Promise<void> {
  await page.evaluate(() => window.location.assign('#/guid'));
  await page.waitForFunction(() => window.location.hash === '#/guid', undefined, { timeout: 5_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
}

// ── Single iteration ────────────────────────────────────────────────────────

async function runOneIteration(iteration: number, args: Args): Promise<StartupTiming> {
  const logPath = getLogFilePath();
  const logOffset = getLogFileSize(logPath);
  const timestamp = new Date().toISOString();

  let failed = false;
  let failureReason: string | null = null;
  let app: ElectronApplication | null = null;
  let memory: MemoryProfile | null = null;

  const wallStart = Date.now();
  let wallFirstWindow = 0;
  let wallDomContentLoaded = 0;
  let wallInteractive = 0;
  let wallTotal = 0;

  try {
    app = await launchApp(args.launchTimeoutMs, args.withMemory);
    const page = await resolveMainWindow(app, args.launchTimeoutMs);
    wallFirstWindow = Date.now() - wallStart;

    await page.waitForLoadState('domcontentloaded', { timeout: args.interactiveTimeoutMs });
    wallDomContentLoaded = Date.now() - wallStart;

    // Chat input visible = time-to-interactive (app is usable)
    await page.locator(GUID_INPUT).first().waitFor({ state: 'visible', timeout: args.interactiveTimeoutMs });
    wallInteractive = Date.now() - wallStart;

    // Give async init (ACP detector, etc.) a brief window to finish and flush logs
    await new Promise((r) => setTimeout(r, 1_000));
    wallTotal = Date.now() - wallStart;

    if (args.withMemory) {
      // 1. Idle — wait longer so background tasks (ACP detection, tray, i18n) settle
      await new Promise((r) => setTimeout(r, 5_000));
      const idle = await takeSnapshot(app, page);

      // 2. After opening a conversation (agent pill selected, no message sent)
      let afterConversation: MemorySnapshot | null = null;
      const opened = await openConversation(page, 15_000);
      if (opened) {
        await new Promise((r) => setTimeout(r, 2_000));
        afterConversation = await takeSnapshot(app, page);
      }

      // 3. After closing / navigating back to guid
      await closeConversation(page);
      await new Promise((r) => setTimeout(r, 2_000));
      const afterClose = await takeSnapshot(app, page);

      memory = {
        idle,
        afterConversation,
        afterClose,
        ...computeMemoryDeltas(idle, afterConversation, afterClose),
      };
    }
  } catch (err) {
    failed = true;
    failureReason = err instanceof Error ? err.message : String(err);
    wallTotal = Date.now() - wallStart;
  } finally {
    if (app) {
      try {
        await app.evaluate(async ({ app: a }) => a.exit(0));
      } catch {
        // ignore
      }
      await app.close().catch(() => {});
    }
  }

  // Wait briefly for the log file to flush after process exit
  await new Promise((r) => setTimeout(r, 500));
  const logLines = readNewLogLines(logPath, logOffset);
  const marks = parseStartupLog(logLines);

  return {
    iteration,
    timestamp,
    failed,
    failureReason,
    wallFirstWindowMs: wallFirstWindow,
    wallDomContentLoadedMs: wallDomContentLoaded,
    wallTimeToInteractiveMs: wallInteractive,
    wallTotalMs: wallTotal,
    readyInitializeProcessMs: marks.ready.get('initializeProcess') ?? 0,
    readyInitializeZoomFactorMs: marks.ready.get('initializeZoomFactor') ?? 0,
    readyCreateWindowMs: marks.ready.get('createWindow') ?? 0,
    readyInitializeAcpDetectorMs: marks.ready.get('initializeAcpDetector') ?? 0,
    initTotalMs: marks.init.get('done') ?? 0,
    processInitStorageMs: marks.process.get('initStorage') ?? 0,
    processExtensionRegistryMs: marks.process.get('ExtensionRegistry') ?? 0,
    processChannelManagerMs: marks.process.get('ChannelManager') ?? 0,
    logRendererDidFinishLoadPresent: marks.logs.rendererDidFinishLoad,
    logWindowReadyToShowPresent: marks.logs.windowReadyToShow,
    logShowingMainWindowPresent: marks.logs.showingMainWindow,
    memory,
  };
}

// ── Statistics ──────────────────────────────────────────────────────────────

type Stats = { count: number; mean: number; median: number; p95: number; min: number; max: number };

function computeStats(values: number[]): Stats {
  const sorted = [...values].filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 };
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = Math.round(sum / sorted.length);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { count: sorted.length, mean, median, p95, min: sorted[0], max: sorted[sorted.length - 1] };
}

// ── Memory summary ──────────────────────────────────────────────────────────

type MemorySummary = {
  idleMainRss: Stats;
  idleMainHeapUsed: Stats;
  idleRendererUsed: Stats;
  afterConversationMainRss: Stats;
  afterConversationRendererUsed: Stats;
  afterCloseMainRss: Stats;
  afterCloseRendererUsed: Stats;
  leakMainRssBytes: Stats;
  leakRendererUsedBytes: Stats;
  openDeltaMainRssBytes: Stats;
  openDeltaRendererUsedBytes: Stats;
};

function computeMemorySummary(results: StartupTiming[]): MemorySummary | null {
  const withMem = results.filter((r) => !r.failed && r.memory);
  if (withMem.length === 0) return null;

  const pick = <T>(snapGet: (m: MemoryProfile) => number): Stats =>
    computeStats(withMem.map((r) => (r.memory ? snapGet(r.memory) : 0)));

  return {
    idleMainRss: pick((m) => m.idle?.main?.rss ?? 0),
    idleMainHeapUsed: pick((m) => m.idle?.main?.heapUsed ?? 0),
    idleRendererUsed: pick((m) => m.idle?.renderer?.usedSize ?? 0),
    afterConversationMainRss: pick((m) => m.afterConversation?.main?.rss ?? 0),
    afterConversationRendererUsed: pick((m) => m.afterConversation?.renderer?.usedSize ?? 0),
    afterCloseMainRss: pick((m) => m.afterClose?.main?.rss ?? 0),
    afterCloseRendererUsed: pick((m) => m.afterClose?.renderer?.usedSize ?? 0),
    leakMainRssBytes: pick((m) => m.leakMainRssBytes),
    leakRendererUsedBytes: pick((m) => m.leakRendererUsedBytes),
    openDeltaMainRssBytes: pick((m) => m.openDeltaMainRssBytes),
    openDeltaRendererUsedBytes: pick((m) => m.openDeltaRendererUsedBytes),
  };
}

// ── Reporting ───────────────────────────────────────────────────────────────

function formatMb(bytes: number): string {
  if (bytes === 0) return '0MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}

function printTerminalReport(results: StartupTiming[]): void {
  const successful = results.filter((r) => !r.failed);
  const failed = results.filter((r) => r.failed);

  console.log('\n' + '='.repeat(80));
  console.log('  Electron Cold Startup Benchmark — Summary');
  console.log('='.repeat(80));
  console.log(`  Iterations: ${results.length} (successful: ${successful.length}, failed: ${failed.length})`);
  console.log('-'.repeat(80));

  const rows: [string, Stats][] = [
    ['Wall: first window', computeStats(successful.map((r) => r.wallFirstWindowMs))],
    ['Wall: DOM loaded', computeStats(successful.map((r) => r.wallDomContentLoadedMs))],
    ['Wall: interactive', computeStats(successful.map((r) => r.wallTimeToInteractiveMs))],
    ['Wall: total', computeStats(successful.map((r) => r.wallTotalMs))],
    ['ready: initializeProcess', computeStats(successful.map((r) => r.readyInitializeProcessMs))],
    ['ready: createWindow', computeStats(successful.map((r) => r.readyCreateWindowMs))],
    ['ready: initAcpDetector', computeStats(successful.map((r) => r.readyInitializeAcpDetectorMs))],
    ['init: done (storage)', computeStats(successful.map((r) => r.initTotalMs))],
    ['process: initStorage', computeStats(successful.map((r) => r.processInitStorageMs))],
    ['process: ExtensionReg', computeStats(successful.map((r) => r.processExtensionRegistryMs))],
    ['process: ChannelMgr', computeStats(successful.map((r) => r.processChannelManagerMs))],
  ];

  const pad = 26;
  console.log(
    `  ${'Phase'.padEnd(pad)} ${'Mean'.padStart(8)} ${'Median'.padStart(8)} ${'P95'.padStart(8)} ${'Min'.padStart(8)} ${'Max'.padStart(8)} ${'N'.padStart(4)}`
  );
  console.log('-'.repeat(80));
  for (const [label, s] of rows) {
    console.log(
      `  ${label.padEnd(pad)} ${(s.mean + 'ms').padStart(8)} ${(s.median + 'ms').padStart(8)} ${(s.p95 + 'ms').padStart(8)} ${(s.min + 'ms').padStart(8)} ${(s.max + 'ms').padStart(8)} ${String(s.count).padStart(4)}`
    );
  }

  const memSummary = computeMemorySummary(successful);
  if (memSummary) {
    console.log('-'.repeat(80));
    console.log('  Memory Profile (median across runs)');
    console.log('-'.repeat(80));
    const memRows: [string, number][] = [
      ['Idle — main RSS', memSummary.idleMainRss.median],
      ['Idle — main heapUsed', memSummary.idleMainHeapUsed.median],
      ['Idle — renderer used', memSummary.idleRendererUsed.median],
      ['After conv — main RSS', memSummary.afterConversationMainRss.median],
      ['After conv — renderer', memSummary.afterConversationRendererUsed.median],
      ['After close — main RSS', memSummary.afterCloseMainRss.median],
      ['After close — renderer', memSummary.afterCloseRendererUsed.median],
      ['Leak — main RSS', memSummary.leakMainRssBytes.median],
      ['Leak — renderer used', memSummary.leakRendererUsedBytes.median],
      ['Δopen — main RSS', memSummary.openDeltaMainRssBytes.median],
      ['Δopen — renderer used', memSummary.openDeltaRendererUsedBytes.median],
    ];
    for (const [label, bytes] of memRows) {
      console.log(`  ${label.padEnd(pad)} ${formatMb(bytes).padStart(10)}`);
    }
  }

  if (failed.length > 0) {
    console.log('-'.repeat(80));
    console.log('  Failed iterations:');
    for (const r of failed) {
      console.log(`    #${r.iteration}: ${r.failureReason ?? 'unknown'}`);
    }
  }

  console.log('='.repeat(80) + '\n');
}

function writeJsonReport(results: StartupTiming[], outputPath: string | null): string {
  const outputDir = path.join(__dirname, 'benchmark-results');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const resolved = outputPath ?? path.join(outputDir, `startup-${now}.json`);

  const successful = results.filter((r) => !r.failed);
  const summary = {
    generatedAt: new Date().toISOString(),
    iterations: results.length,
    successful: successful.length,
    failed: results.length - successful.length,
    stats: {
      wallTimeToInteractive: computeStats(successful.map((r) => r.wallTimeToInteractiveMs)),
      wallTotal: computeStats(successful.map((r) => r.wallTotalMs)),
      readyInitializeProcess: computeStats(successful.map((r) => r.readyInitializeProcessMs)),
      readyCreateWindow: computeStats(successful.map((r) => r.readyCreateWindowMs)),
      readyInitializeAcpDetector: computeStats(successful.map((r) => r.readyInitializeAcpDetectorMs)),
      initTotal: computeStats(successful.map((r) => r.initTotalMs)),
      processInitStorage: computeStats(successful.map((r) => r.processInitStorageMs)),
      processExtensionRegistry: computeStats(successful.map((r) => r.processExtensionRegistryMs)),
      processChannelManager: computeStats(successful.map((r) => r.processChannelManagerMs)),
    },
    memorySummary: computeMemorySummary(successful),
    results,
  };

  fs.writeFileSync(resolved, JSON.stringify(summary, null, 2), 'utf-8');
  return resolved;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  console.log(
    `[bench:startup] iterations=${args.iterations} cooldown=${args.cooldownMs}ms launchTimeout=${args.launchTimeoutMs}ms withMemory=${args.withMemory}`
  );

  const results: StartupTiming[] = [];
  for (let i = 1; i <= args.iterations; i++) {
    console.log(`\n[bench:startup] --- iteration ${i}/${args.iterations} ---`);
    const timing = await runOneIteration(i, args);
    results.push(timing);

    if (timing.failed) {
      console.log(`[bench:startup] #${i} FAILED: ${timing.failureReason}`);
    } else {
      const memSuffix = timing.memory
        ? ` idleRss=${formatMb(timing.memory.idle?.main?.rss ?? 0)} leakRss=${formatMb(timing.memory.leakMainRssBytes)}`
        : '';
      console.log(
        `[bench:startup] #${i} interactive=${timing.wallTimeToInteractiveMs}ms ` +
          `domLoaded=${timing.wallDomContentLoadedMs}ms ` +
          `createWindow=${timing.readyCreateWindowMs}ms ` +
          `initProcess=${timing.readyInitializeProcessMs}ms ` +
          `acp=${timing.readyInitializeAcpDetectorMs}ms` +
          memSuffix
      );
    }

    if (i < args.iterations && args.cooldownMs > 0) {
      await new Promise((r) => setTimeout(r, args.cooldownMs));
    }
  }

  printTerminalReport(results);
  const reportPath = writeJsonReport(results, args.outputJson);
  console.log(`[bench:startup] JSON report: ${reportPath}`);
}

main().catch((err) => {
  console.error('[bench:startup] Fatal error:', err);
  process.exit(1);
});
