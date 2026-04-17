/**
 * Unified performance benchmark runner.
 *
 * Runs `vitest bench`, optionally the startup benchmark, parses results,
 * prints a terminal summary, and generates an HTML report.
 *
 * Usage:
 *   bun run bench:report                    # vitest bench only
 *   bun run bench:full                      # vitest bench + startup bench
 *   bunx tsx scripts/run-benchmarks.ts [--startup]
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ── Types ───────────────────────────────────────────────────────────────────

type BenchResult = {
  name: string;
  suite: string;
  hz: number;
  mean: number;
  min: number;
  max: number;
  p75: number;
  p99: number;
  samples: number;
  rme: string;
};

type PhaseStats = {
  count: number;
  mean: number;
  median: number;
  p95: number;
  min: number;
  max: number;
};

type MemorySnapshot = {
  mainRssMb: number;
  rendererHeapMb: number;
};

type StartupMemory = {
  idle?: MemorySnapshot;
  afterConversation?: MemorySnapshot;
  afterClose?: MemorySnapshot;
  leakEstimateMb?: number;
};

// Normalized shape consumed by the terminal/HTML renderers. The raw JSON
// emitted by scripts/benchmark-startup.ts uses a different memory layout
// (see MemorySummaryRaw) that we adapt before filling this in.
type StartupBenchReport = {
  generatedAt: string;
  iterations: number;
  successful: number;
  failed: number;
  stats: Record<string, PhaseStats>;
  memory?: StartupMemory;
};

// Raw `memorySummary` shape emitted by scripts/benchmark-startup.ts. Values
// are bytes and each metric is a PhaseStats distribution across iterations.
type MemorySummaryRaw = {
  idleMainRss: PhaseStats;
  idleMainHeapUsed: PhaseStats;
  idleRendererUsed: PhaseStats;
  afterConversationMainRss: PhaseStats;
  afterConversationRendererUsed: PhaseStats;
  afterCloseMainRss: PhaseStats;
  afterCloseRendererUsed: PhaseStats;
  leakMainRssBytes: PhaseStats;
  leakRendererUsedBytes: PhaseStats;
  openDeltaMainRssBytes: PhaseStats;
  openDeltaRendererUsedBytes: PhaseStats;
};

// What the JSON file from benchmark-startup.ts actually contains on disk. It
// uses `memorySummary` with byte-valued distributions; we map this to the
// `memory` field on StartupBenchReport (MB-valued snapshots).
type StartupBenchReportRaw = Omit<StartupBenchReport, 'memory'> & {
  memorySummary?: MemorySummaryRaw | null;
};

type StartupPhaseEntry = {
  key: string;
  label: string;
  isColdStart?: boolean;
};

const STARTUP_PHASES: StartupPhaseEntry[] = [
  { key: 'readyInitializeProcess', label: 'initializeProcess' },
  { key: 'readyCreateWindow', label: 'createWindow' },
  { key: 'readyInitializeAcpDetector', label: 'ACP detection' },
  { key: 'initTotal', label: 'Renderer init total' },
  { key: 'processInitStorage', label: 'process: initStorage' },
  { key: 'processExtensionRegistry', label: 'process: ExtensionRegistry' },
  { key: 'processChannelManager', label: 'process: ChannelManager' },
  { key: 'wallTimeToInteractive', label: 'Wall: time-to-interactive', isColdStart: true },
  { key: 'wallTotal', label: 'Wall: total' },
];

type BundleSizeReport = {
  rendererTotalMb: number;
  jsTotalMb: number;
  cssTotalMb: number;
  largestChunk: { name: string; sizeMb: number };
  jsChunkCount: number;
  warnings: string[];
};

type BenchReport = {
  timestamp: string;
  gitRef: string;
  results: BenchResult[];
  startup?: StartupBenchReport;
  bundleSize?: BundleSizeReport;
};

// ── Red line thresholds (in ms / MB) ────────────────────────────────────────

const THRESHOLDS = {
  mainRssIdleMb: 400,
  rendererHeapIdleMb: 150,
  leakAfterCloseMb: 5,
  coldStartWindowMs: 3000,
  rendererTotalMb: 30,
  jsTotalMb: 25,
  singleChunkMb: 2,
  bundleSizeRegressionPct: 10,
} as const;

// ── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(): { startup: boolean } {
  const args = process.argv.slice(2);
  return { startup: args.includes('--startup') };
}

// ── Run vitest bench ────────────────────────────────────────────────────────

function runBenchmarks(): string {
  console.log('\n  Running performance benchmarks...\n');

  try {
    const output = execSync('npx vitest bench', {
      encoding: 'utf-8',
      cwd: process.cwd(),
      timeout: 300_000,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    return output;
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    if (err.stdout) return err.stdout;
    console.error('  Benchmark run failed.');
    process.exit(1);
  }
}

// ── Run startup benchmark (Electron) ────────────────────────────────────────

function bytesToMb(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

// Collapse the bytes-per-iteration distribution from benchmark-startup.ts into
// the MB-valued snapshots the renderers expect. We take the median of each
// metric so a single slow run doesn't distort the report.
function adaptMemorySummary(raw: MemorySummaryRaw | null | undefined): StartupMemory | undefined {
  if (!raw) return undefined;
  return {
    idle: {
      mainRssMb: bytesToMb(raw.idleMainRss.median),
      rendererHeapMb: bytesToMb(raw.idleRendererUsed.median),
    },
    afterConversation: {
      mainRssMb: bytesToMb(raw.afterConversationMainRss.median),
      rendererHeapMb: bytesToMb(raw.afterConversationRendererUsed.median),
    },
    afterClose: {
      mainRssMb: bytesToMb(raw.afterCloseMainRss.median),
      rendererHeapMb: bytesToMb(raw.afterCloseRendererUsed.median),
    },
    leakEstimateMb: bytesToMb(raw.leakMainRssBytes.median),
  };
}

function runStartupBenchmark(reportDir: string): StartupBenchReport | undefined {
  console.log('\n  Running Electron cold-startup benchmark (this may take a few minutes)...\n');

  const outputPath = path.join(reportDir, 'startup-latest.json');
  if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });

  // --with-memory enables idle / afterConversation / afterClose memory
  // sampling in benchmark-startup.ts. Without it, memorySummary stays null
  // and bench:full produces no memory report.
  const result = spawnSync('bunx', ['tsx', 'scripts/benchmark-startup.ts', '--with-memory', '--output', outputPath], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    timeout: 600_000,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  if (result.error) {
    console.error(`  Startup bench could not launch: ${result.error.message}`);
    return undefined;
  }
  if (result.status !== 0) {
    console.warn(`  Startup bench exited with status ${result.status}; trying to read partial report.`);
  }

  if (!fs.existsSync(outputPath)) {
    console.warn('  Startup bench did not produce a JSON report.');
    return undefined;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as StartupBenchReportRaw;
    return {
      generatedAt: raw.generatedAt,
      iterations: raw.iterations,
      successful: raw.successful,
      failed: raw.failed,
      stats: raw.stats,
      memory: adaptMemorySummary(raw.memorySummary),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  Startup bench report was not valid JSON: ${msg}`);
    return undefined;
  }
}

// ── Run DB bench (bun test) ────────────────────────────────────────────────

function runDbBench(): BenchResult[] {
  console.log('\n  Running DB large-dataset benchmark (bun:sqlite)...\n');

  const resultFile = path.resolve('scripts/benchmark-results/db-bench-latest.json');
  if (fs.existsSync(resultFile)) fs.rmSync(resultFile);

  try {
    spawnSync('bun', ['test', './tests/bench/database.bench.bun.ts'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: 'inherit',
    });
  } catch {
    console.warn('  DB bench failed to run.');
  }

  if (!fs.existsSync(resultFile)) {
    console.warn('  DB bench did not produce results.');
    return [];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(resultFile, 'utf-8')) as Array<{
      name: string;
      suite: string;
      ops: number;
      meanMs: number;
      minMs: number;
      maxMs: number;
    }>;
    return raw.map((r) => ({
      name: r.name,
      suite: r.suite,
      hz: r.ops,
      mean: r.meanMs,
      min: r.minMs,
      max: r.maxMs,
      p75: 0,
      p99: 0,
      samples: 100,
      rme: '-',
    }));
  } catch {
    console.warn('  Failed to parse DB bench results.');
    return [];
  }
}

// ── Bundle size check ──────────────────────────────────────────────────────

function checkBundleSize(): BundleSizeReport | undefined {
  // Try current directory first, then main repo root (worktrees don't have build output)
  let rendererDir = path.resolve('out/renderer');
  if (!fs.existsSync(rendererDir)) {
    try {
      const commonDir = execSync('git rev-parse --git-common-dir', { encoding: 'utf-8' }).trim();
      const mainRoot = path.resolve(commonDir, '..');
      rendererDir = path.join(mainRoot, 'out/renderer');
    } catch {
      // not in a git repo or no common dir
    }
  }
  const assetsDir = path.join(rendererDir, 'assets');

  if (!fs.existsSync(rendererDir)) {
    console.log('  out/renderer/ not found — run `bun run package` first to check bundle size.\n');
    return undefined;
  }

  const dirSize = (dir: string): number => {
    let total = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) total += dirSize(p);
      else total += fs.statSync(p).size;
    }
    return total;
  };

  const rendererTotalBytes = dirSize(rendererDir);
  const rendererTotalMb = Math.round((rendererTotalBytes / 1024 / 1024) * 100) / 100;

  let jsTotalBytes = 0;
  let cssTotalBytes = 0;
  let largestChunk = { name: '', sizeMb: 0 };
  let jsChunkCount = 0;

  if (fs.existsSync(assetsDir)) {
    for (const file of fs.readdirSync(assetsDir)) {
      const filePath = path.join(assetsDir, file);
      const size = fs.statSync(filePath).size;
      if (file.endsWith('.js')) {
        jsTotalBytes += size;
        jsChunkCount++;
        const sizeMb = Math.round((size / 1024 / 1024) * 100) / 100;
        if (sizeMb > largestChunk.sizeMb) {
          largestChunk = { name: file, sizeMb };
        }
      } else if (file.endsWith('.css')) {
        cssTotalBytes += size;
      }
    }
  }

  const jsTotalMb = Math.round((jsTotalBytes / 1024 / 1024) * 100) / 100;
  const cssTotalMb = Math.round((cssTotalBytes / 1024 / 1024) * 100) / 100;

  const warnings: string[] = [];
  if (rendererTotalMb > THRESHOLDS.rendererTotalMb) {
    warnings.push(`renderer total ${rendererTotalMb}MB exceeds ${THRESHOLDS.rendererTotalMb}MB`);
  }
  if (jsTotalMb > THRESHOLDS.jsTotalMb) {
    warnings.push(`JS total ${jsTotalMb}MB exceeds ${THRESHOLDS.jsTotalMb}MB`);
  }
  if (largestChunk.sizeMb > THRESHOLDS.singleChunkMb) {
    warnings.push(`chunk ${largestChunk.name} is ${largestChunk.sizeMb}MB (> ${THRESHOLDS.singleChunkMb}MB)`);
  }

  return { rendererTotalMb, jsTotalMb, cssTotalMb, largestChunk, jsChunkCount, warnings };
}

// ── Parse vitest bench verbose output ───────────────────────────────────────

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[\d+m/g, '');
}

function parseOutput(output: string): BenchResult[] {
  const results: BenchResult[] = [];
  let currentSuite = '';

  const clean = stripAnsi(output);
  const lines = clean.split('\n');

  for (const line of lines) {
    // Detect suite headers like:  ✓ node tests/bench/serialization.bench.ts > Message content parsing 2424ms
    const suiteMatch = line.match(/tests\/bench\/\S+\.bench\.ts\s*>\s*(.+?)(?:\s+\d+ms)?$/);
    if (suiteMatch) {
      currentSuite = suiteMatch[1].trim();
      continue;
    }

    // Detect bench rows: · name   hz  min  max  mean  p75  p99  p995  p999  rme  samples
    const benchMatch = line.match(
      /·\s+(.+?)\s{2,}([\d,]+\.?\d*)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([±\d.%]+)\s+([\d,]+)/
    );
    if (benchMatch && currentSuite) {
      results.push({
        name: benchMatch[1].trim(),
        suite: currentSuite,
        hz: parseFloat(benchMatch[2].replace(/,/g, '')),
        min: parseFloat(benchMatch[3]),
        max: parseFloat(benchMatch[4]),
        mean: parseFloat(benchMatch[5]),
        p75: parseFloat(benchMatch[6]),
        p99: parseFloat(benchMatch[7]),
        samples: parseInt(benchMatch[11].replace(/,/g, ''), 10),
        rme: benchMatch[10],
      });
    }
  }

  return results;
}

// ── Terminal report ─────────────────────────────────────────────────────────

function printTerminalReport(report: BenchReport): void {
  console.log('\n  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║              AionUi Performance Benchmark Report            ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Git: ${report.gitRef}`);
  console.log(`  Time: ${report.timestamp}`);
  console.log(`  Benchmarks: ${report.results.length}\n`);

  let lastSuite = '';
  for (const r of report.results) {
    if (r.suite !== lastSuite) {
      console.log(`  ── ${r.suite} ${'─'.repeat(Math.max(0, 50 - r.suite.length))}`);
      lastSuite = r.suite;
    }
    const opsStr = r.hz > 0 ? `${formatNumber(r.hz)} ops/s` : '';
    const meanStr = `${formatTime(r.mean)}`;
    console.log(`    ${r.name.padEnd(50)} ${meanStr.padStart(12)} ${opsStr.padStart(16)} ${r.rme}`);
  }
  console.log('');

  if (report.startup) {
    printStartupSection(report.startup);
  }

  if (report.bundleSize) {
    printBundleSizeSection(report.bundleSize);
  }
}

function printBundleSizeSection(bundle: BundleSizeReport): void {
  console.log('  ── Bundle Size ' + '─'.repeat(48));
  console.log(`    Renderer total:       ${bundle.rendererTotalMb} MB`);
  console.log(`    JS total:             ${bundle.jsTotalMb} MB  (${bundle.jsChunkCount} chunks)`);
  console.log(`    CSS total:            ${bundle.cssTotalMb} MB`);
  console.log(`    Largest chunk:        ${bundle.largestChunk.name}  (${bundle.largestChunk.sizeMb} MB)`);
  if (bundle.warnings.length > 0) {
    console.log('');
    for (const w of bundle.warnings) {
      console.log(`    ⚠  ${w}`);
    }
  }
  console.log('');
}

function printStartupSection(startup: StartupBenchReport): void {
  console.log('  ── Startup Performance ' + '─'.repeat(40));
  console.log(`  Iterations: ${startup.iterations} (successful: ${startup.successful}, failed: ${startup.failed})\n`);
  console.log(
    `    ${'Phase'.padEnd(30)} ${'Mean'.padStart(10)} ${'Median'.padStart(10)} ${'P95'.padStart(10)} ${'Min'.padStart(10)} ${'Max'.padStart(10)}`
  );
  console.log(`    ${'─'.repeat(82)}`);

  for (const phase of STARTUP_PHASES) {
    const s = startup.stats[phase.key];
    if (!s || s.count === 0) continue;
    const over =
      phase.isColdStart && s.mean > THRESHOLDS.coldStartWindowMs ? `  !! > ${THRESHOLDS.coldStartWindowMs}ms` : '';
    console.log(
      `    ${phase.label.padEnd(30)} ${(s.mean + 'ms').padStart(10)} ${(s.median + 'ms').padStart(10)} ${(s.p95 + 'ms').padStart(10)} ${(s.min + 'ms').padStart(10)} ${(s.max + 'ms').padStart(10)}${over}`
    );
  }
  console.log('');

  if (startup.memory) printMemorySection(startup.memory);
}

function printMemorySection(memory: StartupMemory): void {
  console.log('  ── Memory Profiling ' + '─'.repeat(43));
  console.log(`    ${'Stage'.padEnd(26)} ${'Main RSS'.padStart(14)} ${'Renderer Heap'.padStart(18)}`);
  console.log(`    ${'─'.repeat(60)}`);

  const stages: Array<[string, MemorySnapshot | undefined, boolean]> = [
    ['Idle', memory.idle, true],
    ['After conversation', memory.afterConversation, false],
    ['After close', memory.afterClose, false],
  ];

  for (const [label, snap, isIdle] of stages) {
    if (!snap) continue;
    const rssOver = isIdle && snap.mainRssMb > THRESHOLDS.mainRssIdleMb ? ' !!' : '';
    const heapOver = isIdle && snap.rendererHeapMb > THRESHOLDS.rendererHeapIdleMb ? ' !!' : '';
    console.log(
      `    ${label.padEnd(26)} ${(snap.mainRssMb + 'MB' + rssOver).padStart(14)} ${(snap.rendererHeapMb + 'MB' + heapOver).padStart(18)}`
    );
  }

  if (memory.leakEstimateMb !== undefined) {
    const leakOver =
      memory.leakEstimateMb > THRESHOLDS.leakAfterCloseMb ? `  !! > ${THRESHOLDS.leakAfterCloseMb}MB` : '';
    console.log(`    ${'Leak estimate'.padEnd(26)} ${(memory.leakEstimateMb + 'MB').padStart(14)}${leakOver}`);
  }
  console.log('');
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

function formatTime(ms: number): string {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(0)}ns`;
  if (ms < 1) return `${(ms * 1_000).toFixed(2)}us`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ── HTML report ─────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderStartupHtml(startup: StartupBenchReport): string {
  const rows = STARTUP_PHASES.map((phase) => {
    const s = startup.stats[phase.key];
    if (!s || s.count === 0) return '';
    const over = phase.isColdStart === true && s.mean > THRESHOLDS.coldStartWindowMs;
    const cls = over ? ' class="over-threshold"' : '';
    const badge = over ? ` <span class="badge-red">&gt; ${THRESHOLDS.coldStartWindowMs}ms</span>` : '';
    return `<tr${cls}><td>${esc(phase.label)}${badge}</td><td>${s.mean}ms</td><td>${s.median}ms</td><td>${s.p95}ms</td><td>${s.min}ms</td><td>${s.max}ms</td><td>${s.count}</td></tr>`;
  })
    .filter(Boolean)
    .join('\n');

  const failedNote = startup.failed > 0 ? ` &bull; <span class="count-red">${startup.failed} failed</span>` : '';

  const startupTable = `
    <h2>Startup Performance</h2>
    <p class="sub">Iterations: ${startup.iterations} (successful: ${startup.successful}${failedNote}). Rows in red exceed the cold-start red line (${THRESHOLDS.coldStartWindowMs}ms).</p>
    <table>
    <thead><tr><th>Phase</th><th>Mean</th><th>Median</th><th>P95</th><th>Min</th><th>Max</th><th>N</th></tr></thead>
    <tbody>
    ${rows}
    </tbody>
    </table>`;

  if (!startup.memory) return startupTable;

  const mem = startup.memory;
  const memRows: string[] = [];
  const pushMemRow = (label: string, snap: MemorySnapshot | undefined, isIdle: boolean) => {
    if (!snap) return;
    const rssOver = isIdle && snap.mainRssMb > THRESHOLDS.mainRssIdleMb;
    const heapOver = isIdle && snap.rendererHeapMb > THRESHOLDS.rendererHeapIdleMb;
    const rssCell = `<td${rssOver ? ' class="over-threshold"' : ''}>${snap.mainRssMb}MB${rssOver ? ` <span class="badge-red">&gt; ${THRESHOLDS.mainRssIdleMb}MB</span>` : ''}</td>`;
    const heapCell = `<td${heapOver ? ' class="over-threshold"' : ''}>${snap.rendererHeapMb}MB${heapOver ? ` <span class="badge-red">&gt; ${THRESHOLDS.rendererHeapIdleMb}MB</span>` : ''}</td>`;
    memRows.push(`<tr><td>${esc(label)}</td>${rssCell}${heapCell}</tr>`);
  };
  pushMemRow('Idle', mem.idle, true);
  pushMemRow('After conversation', mem.afterConversation, false);
  pushMemRow('After close', mem.afterClose, false);

  let leakRow = '';
  if (mem.leakEstimateMb !== undefined) {
    const over = mem.leakEstimateMb > THRESHOLDS.leakAfterCloseMb;
    const cls = over ? ' class="over-threshold"' : '';
    const note = over ? ` <span class="badge-red">&gt; ${THRESHOLDS.leakAfterCloseMb}MB</span>` : '';
    leakRow = `<tr${cls}><td>Leak estimate (post-close residual)</td><td colspan="2">${mem.leakEstimateMb}MB${note}</td></tr>`;
  }

  const memTable = `
    <h2>Memory Profiling</h2>
    <p class="sub">Red cells exceed the red line (main RSS idle &gt; ${THRESHOLDS.mainRssIdleMb}MB, renderer heap idle &gt; ${THRESHOLDS.rendererHeapIdleMb}MB, leak &gt; ${THRESHOLDS.leakAfterCloseMb}MB).</p>
    <table>
    <thead><tr><th>Stage</th><th>Main Process RSS</th><th>Renderer JS Heap</th></tr></thead>
    <tbody>
    ${memRows.join('\n')}
    ${leakRow}
    </tbody>
    </table>`;

  return startupTable + memTable;
}

function renderBundleSizeHtml(bundle: BundleSizeReport): string {
  const rTotalCls = bundle.rendererTotalMb > THRESHOLDS.rendererTotalMb ? ' class="over-threshold"' : '';
  const jsTotalCls = bundle.jsTotalMb > THRESHOLDS.jsTotalMb ? ' class="over-threshold"' : '';
  const chunkCls = bundle.largestChunk.sizeMb > THRESHOLDS.singleChunkMb ? ' class="over-threshold"' : '';

  const warningHtml =
    bundle.warnings.length > 0
      ? `<div style="margin-top:12px">${bundle.warnings.map((w) => `<div style="color:var(--red)">&#9888; ${esc(w)}</div>`).join('')}</div>`
      : '<p class="ok" style="margin-top:8px">All bundle sizes within thresholds.</p>';

  return `
    <h2>Bundle Size</h2>
    <p class="sub">Thresholds: renderer &lt; ${THRESHOLDS.rendererTotalMb}MB, JS &lt; ${THRESHOLDS.jsTotalMb}MB, single chunk &lt; ${THRESHOLDS.singleChunkMb}MB</p>
    <table>
    <thead><tr><th>Metric</th><th>Value</th><th>Threshold</th></tr></thead>
    <tbody>
    <tr${rTotalCls}><td>Renderer total</td><td>${bundle.rendererTotalMb} MB</td><td>${THRESHOLDS.rendererTotalMb} MB</td></tr>
    <tr${jsTotalCls}><td>JS total (${bundle.jsChunkCount} chunks)</td><td>${bundle.jsTotalMb} MB</td><td>${THRESHOLDS.jsTotalMb} MB</td></tr>
    <tr><td>CSS total</td><td>${bundle.cssTotalMb} MB</td><td>—</td></tr>
    <tr${chunkCls}><td>Largest chunk: ${esc(bundle.largestChunk.name)}</td><td>${bundle.largestChunk.sizeMb} MB</td><td>${THRESHOLDS.singleChunkMb} MB</td></tr>
    </tbody>
    </table>
    ${warningHtml}`;
}

function generateHtmlReport(report: BenchReport): string {
  const suites = [...new Set(report.results.map((r) => r.suite))];

  const suiteSections = suites
    .map((suite) => {
      const rows = report.results.filter((r) => r.suite === suite);
      return `
    <h2>${esc(suite)}</h2>
    <table>
    <thead><tr><th>Benchmark</th><th>Mean</th><th>Ops/s</th><th>Min</th><th>Max</th><th>p75</th><th>p99</th><th>Samples</th><th>RME</th></tr></thead>
    <tbody>
    ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${formatTime(r.mean)}</td><td>${formatNumber(r.hz)}</td><td>${formatTime(r.min)}</td><td>${formatTime(r.max)}</td><td>${formatTime(r.p75)}</td><td>${formatTime(r.p99)}</td><td>${r.samples.toLocaleString()}</td><td>${esc(r.rme)}</td></tr>`).join('\n')}
    </tbody>
    </table>`;
    })
    .join('\n');

  const startupSection = report.startup ? renderStartupHtml(report.startup) : '';
  const bundleSection = report.bundleSize ? renderBundleSizeHtml(report.bundleSize) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AionUi Benchmark Report - ${report.timestamp}</title>
<style>
  :root { --bg: #0d1117; --fg: #c9d1d9; --border: #30363d; --accent: #58a6ff; --green: #3fb950; --red: #f85149; --card: #161b22; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'SF Mono', 'Cascadia Code', monospace; background: var(--bg); color: var(--fg); padding: 24px; max-width: 1200px; margin: 0 auto; }
  h1 { color: var(--accent); margin-bottom: 8px; font-size: 20px; }
  .meta { color: #8b949e; margin-bottom: 24px; font-size: 13px; }
  .sub { color: #8b949e; margin: 0 0 12px; font-size: 12px; }
  h2 { color: var(--fg); margin: 20px 0 12px; font-size: 16px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; background: var(--card); border: 1px solid var(--border); color: var(--accent); font-weight: 600; }
  td { padding: 6px 12px; border: 1px solid var(--border); }
  tr:hover { background: var(--card); }
  .count { color: var(--green); font-weight: bold; }
  .count-red { color: var(--red); font-weight: bold; }
  tr.over-threshold { background: rgba(248, 81, 73, 0.08); }
  tr.over-threshold td, td.over-threshold { color: var(--red); }
  .badge-red { display: inline-block; padding: 1px 6px; margin-left: 6px; font-size: 11px; background: var(--red); color: #fff; border-radius: 3px; }
</style>
</head>
<body>
<h1>AionUi Performance Benchmark Report</h1>
<div class="meta">
  Git: ${esc(report.gitRef)} | ${esc(report.timestamp)} | <span class="count">${report.results.length} benchmarks</span>${report.startup ? ` | <span class="count">startup (${report.startup.iterations} iter)</span>` : ''}
</div>
${suiteSections}
${startupSection}
${bundleSection}
</body>
</html>`;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const { startup } = parseArgs();

  const output = runBenchmarks();
  const results = parseOutput(output);

  if (results.length === 0) {
    console.error('  No benchmark results parsed. Raw output:');
    console.error(output.slice(0, 2000));
    process.exit(1);
  }

  let gitRef = 'unknown';
  try {
    gitRef = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    gitRef = `${branch}@${gitRef}`;
  } catch {
    // not in a git repo
  }

  const reportDir = path.resolve('scripts/benchmark-results');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const dbResults = runDbBench();
  const allResults = [...results, ...dbResults];

  const startupReport = startup ? runStartupBenchmark(reportDir) : undefined;
  const bundleSize = checkBundleSize();

  const report: BenchReport = {
    timestamp: new Date().toISOString(),
    gitRef,
    results: allResults,
    startup: startupReport,
    bundleSize: bundleSize,
  };

  printTerminalReport(report);

  const htmlPath = path.join(reportDir, `bench-${Date.now()}.html`);
  fs.writeFileSync(htmlPath, generateHtmlReport(report));
  console.log(`  HTML report: ${htmlPath}`);

  const jsonPath = path.join(reportDir, 'latest.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`  JSON baseline: ${jsonPath}\n`);
}

main();
