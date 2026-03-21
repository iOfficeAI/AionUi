/**
 * Benchmark: TypeScript vs Rust filesystem implementations
 * Run with: bunx tsx tests/bench/fs-bench.ts
 */
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import process from 'node:process';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';

// Rust implementation
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rust = require('@aionui/native') as {
  readDirectoryTree: (
    dirPath: string,
    root?: string | null,
    maxDepth?: number | null,
    skipNames?: string[] | null,
    searchText?: string | null
  ) => Promise<unknown>;
  copyDirectory: (src: string, dest: string, overwrite?: boolean | null) => Promise<void>;
  verifyDirectoryStructure: (dir1: string, dir2: string) => Promise<boolean>;
  ensureDir: (dirPath: string) => void;
};

// --- TS reference implementations (from utils.ts) ---

type IDirOrFile = {
  name: string;
  fullPath: string;
  relativePath: string;
  isDir: boolean;
  isFile: boolean;
  children?: IDirOrFile[];
};

async function tsReadDirectoryRecursive(
  dirPath: string,
  options?: { root?: string; maxDepth?: number }
): Promise<IDirOrFile | null> {
  const { root = dirPath, maxDepth = 1 } = options || {};

  try {
    const stats = await fsp.stat(dirPath);
    if (!stats.isDirectory()) return null;
  } catch {
    return null;
  }

  const result: IDirOrFile = {
    name: path.basename(dirPath),
    fullPath: dirPath,
    relativePath: path.relative(root, dirPath),
    isDir: true,
    isFile: false,
    children: [],
  };

  if (maxDepth === 0) return result;

  const items = await fsp.readdir(dirPath);
  for (const item of items) {
    if (item === 'node_modules') continue;
    const itemPath = path.join(dirPath, item);
    let itemStats: Awaited<ReturnType<typeof fsp.stat>>;
    try {
      itemStats = await fsp.stat(itemPath);
    } catch {
      continue;
    }

    if (itemStats.isDirectory()) {
      const child = await tsReadDirectoryRecursive(itemPath, {
        root,
        maxDepth: maxDepth - 1,
      });
      if (child) result.children!.push(child);
    } else {
      result.children!.push({
        name: item,
        fullPath: itemPath,
        relativePath: path.relative(root, itemPath),
        isDir: false,
        isFile: true,
      });
    }
  }

  result.children!.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}

async function tsCopyDirectoryRecursively(src: string, dest: string, overwrite = true) {
  const isWindows = process.platform === 'win32';
  const normalizedSrc = isWindows ? path.resolve(src).toLowerCase() : path.resolve(src);
  const normalizedDest = isWindows ? path.resolve(dest).toLowerCase() : path.resolve(dest);
  if (normalizedSrc === normalizedDest) throw new Error('Cannot copy directory into itself');
  if (normalizedDest.startsWith(normalizedSrc + path.sep))
    throw new Error('Cannot copy directory into its subdirectory');
  if (normalizedSrc.startsWith(normalizedDest + path.sep))
    throw new Error('Cannot copy parent directory into child directory');

  if (!fs.existsSync(dest)) await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) await fsp.mkdir(destPath, { recursive: true });
      await tsCopyDirectoryRecursively(srcPath, destPath, overwrite);
    } else {
      if (!overwrite && fs.existsSync(destPath)) continue;
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

async function tsVerifyDirectoryFiles(dir1: string, dir2: string): Promise<boolean> {
  try {
    if (!fs.existsSync(dir1) || !fs.existsSync(dir2)) return false;
    const entries1 = await fsp.readdir(dir1, { withFileTypes: true });
    const entries2 = await fsp.readdir(dir2, { withFileTypes: true });
    if (entries1.length !== entries2.length) return false;
    entries1.sort((a, b) => a.name.localeCompare(b.name));
    entries2.sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < entries1.length; i++) {
      if (entries1[i].name !== entries2[i].name || entries1[i].isDirectory() !== entries2[i].isDirectory())
        return false;
      if (entries1[i].isDirectory()) {
        if (!(await tsVerifyDirectoryFiles(path.join(dir1, entries1[i].name), path.join(dir2, entries2[i].name))))
          return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function tsEnsureDirectory(dirPath: string): void {
  try {
    const stats = fs.lstatSync(dirPath);
    if (stats.isDirectory()) return;
    if (stats.isSymbolicLink()) {
      if (fs.existsSync(dirPath)) return;
      fs.unlinkSync(dirPath);
    } else {
      fs.unlinkSync(dirPath);
    }
  } catch {
    // Doesn't exist
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

// --- Bench utilities ---

const ASYNC_ITERATIONS = 100;
const ASYNC_WARMUP = 10;
const SYNC_ITERATIONS = 5_000;
const SYNC_WARMUP = 500;

type BenchResult = { p50: number; p95: number; p99: number };

function benchSync(fn: () => void): BenchResult {
  for (let i = 0; i < SYNC_WARMUP; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < SYNC_ITERATIONS; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    p50: times[Math.floor(times.length * 0.5)]!,
    p95: times[Math.floor(times.length * 0.95)]!,
    p99: times[Math.floor(times.length * 0.99)]!,
  };
}

async function benchAsync(
  fn: () => Promise<void>,
  iterations = ASYNC_ITERATIONS,
  warmup = ASYNC_WARMUP
): Promise<BenchResult> {
  for (let i = 0; i < warmup; i++) await fn();
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    p50: times[Math.floor(times.length * 0.5)]!,
    p95: times[Math.floor(times.length * 0.95)]!,
    p99: times[Math.floor(times.length * 0.99)]!,
  };
}

function fmt(ms: number): string {
  if (ms < 0.01) return `${(ms * 1000).toFixed(1)}µs`;
  if (ms < 1) return `${ms.toFixed(3)}ms`;
  return `${ms.toFixed(2)}ms`;
}

function speedup(ts: number, rust: number): string {
  if (rust === 0) return 'Inf';
  const ratio = ts / rust;
  return ratio >= 1 ? `${ratio.toFixed(1)}x` : `${(1 / ratio).toFixed(1)}x slower`;
}

// --- Fixtures ---

async function createFixtureTree(base: string, fileCount: number, depth: number): Promise<void> {
  await fsp.mkdir(base, { recursive: true });
  const filesPerLevel = Math.ceil(fileCount / Math.max(depth, 1));

  for (let d = 0; d < depth; d++) {
    const dirPath = d === 0 ? base : path.join(base, ...Array.from({ length: d }, (_, i) => `dir_${i}`));
    await fsp.mkdir(dirPath, { recursive: true });
    for (let f = 0; f < filesPerLevel; f++) {
      await fsp.writeFile(path.join(dirPath, `file_${f}.txt`), `content-${d}-${f}`);
    }
  }
}

// --- Main ---

async function main() {
  console.log('=== FS Bridge Benchmark: TypeScript vs Rust ===\n');
  console.log(`OS:      ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPU:     ${os.cpus()[0]?.model ?? 'unknown'}`);
  console.log(`RAM:     ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`);
  console.log(`Node.js: ${process.version}`);
  console.log('');

  const tmpBase = await fsp.mkdtemp(path.join(os.tmpdir(), 'aionui-fs-bench-'));

  try {
    // ================================================================
    // 1. readDirectoryTree — small directory (50 files, depth 3)
    // ================================================================
    console.log('--- readDirectoryTree (50 files, depth 3) ---');
    const smallDir = path.join(tmpBase, 'small');
    await createFixtureTree(smallDir, 50, 3);

    const tsSmallRead = await benchAsync(async () => {
      await tsReadDirectoryRecursive(smallDir, { maxDepth: 5 });
    });
    const rustSmallRead = await benchAsync(async () => {
      await rust.readDirectoryTree(smallDir, smallDir, 5);
    });
    console.log(`  TS:   p50=${fmt(tsSmallRead.p50)} p95=${fmt(tsSmallRead.p95)}`);
    console.log(`  Rust: p50=${fmt(rustSmallRead.p50)} p95=${fmt(rustSmallRead.p95)}`);
    console.log(`  Speedup: ${speedup(tsSmallRead.p50, rustSmallRead.p50)}`);

    // ================================================================
    // 2. readDirectoryTree — medium directory (500 files, depth 5)
    // ================================================================
    console.log('\n--- readDirectoryTree (500 files, depth 5) ---');
    const medDir = path.join(tmpBase, 'medium');
    await createFixtureTree(medDir, 500, 5);

    const tsMedRead = await benchAsync(async () => {
      await tsReadDirectoryRecursive(medDir, { maxDepth: 10 });
    });
    const rustMedRead = await benchAsync(async () => {
      await rust.readDirectoryTree(medDir, medDir, 10);
    });
    console.log(`  TS:   p50=${fmt(tsMedRead.p50)} p95=${fmt(tsMedRead.p95)}`);
    console.log(`  Rust: p50=${fmt(rustMedRead.p50)} p95=${fmt(rustMedRead.p95)}`);
    console.log(`  Speedup: ${speedup(tsMedRead.p50, rustMedRead.p50)}`);

    // ================================================================
    // 3. readDirectoryTree — large directory (2000 files, depth 8)
    // ================================================================
    console.log('\n--- readDirectoryTree (2000 files, depth 8) ---');
    const largeDir = path.join(tmpBase, 'large');
    await createFixtureTree(largeDir, 2000, 8);

    const tsLargeRead = await benchAsync(
      async () => {
        await tsReadDirectoryRecursive(largeDir, { maxDepth: 15 });
      },
      30,
      3
    );
    const rustLargeRead = await benchAsync(
      async () => {
        await rust.readDirectoryTree(largeDir, largeDir, 15);
      },
      30,
      3
    );
    console.log(`  TS:   p50=${fmt(tsLargeRead.p50)} p95=${fmt(tsLargeRead.p95)}`);
    console.log(`  Rust: p50=${fmt(rustLargeRead.p50)} p95=${fmt(rustLargeRead.p95)}`);
    console.log(`  Speedup: ${speedup(tsLargeRead.p50, rustLargeRead.p50)}`);

    // ================================================================
    // 4. copyDirectory — small tree (50 files)
    // ================================================================
    console.log('\n--- copyDirectory (50 files) ---');
    const copySrc = path.join(tmpBase, 'copy_src');
    await createFixtureTree(copySrc, 50, 3);

    const tsCopy = await benchAsync(
      async () => {
        const dest = path.join(tmpBase, 'copy_ts_' + Date.now());
        await tsCopyDirectoryRecursively(copySrc, dest);
        await fsp.rm(dest, { recursive: true, force: true });
      },
      30,
      3
    );
    const rustCopy = await benchAsync(
      async () => {
        const dest = path.join(tmpBase, 'copy_rust_' + Date.now());
        await rust.copyDirectory(copySrc, dest);
        await fsp.rm(dest, { recursive: true, force: true });
      },
      30,
      3
    );
    console.log(`  TS:   p50=${fmt(tsCopy.p50)} p95=${fmt(tsCopy.p95)}`);
    console.log(`  Rust: p50=${fmt(rustCopy.p50)} p95=${fmt(rustCopy.p95)}`);
    console.log(`  Speedup: ${speedup(tsCopy.p50, rustCopy.p50)}`);

    // ================================================================
    // 5. copyDirectory — medium tree (500 files)
    // ================================================================
    console.log('\n--- copyDirectory (500 files) ---');
    const copyMedSrc = path.join(tmpBase, 'copy_med_src');
    await createFixtureTree(copyMedSrc, 500, 5);

    const tsCopyMed = await benchAsync(
      async () => {
        const dest = path.join(tmpBase, 'cpmed_ts_' + Date.now());
        await tsCopyDirectoryRecursively(copyMedSrc, dest);
        await fsp.rm(dest, { recursive: true, force: true });
      },
      10,
      2
    );
    const rustCopyMed = await benchAsync(
      async () => {
        const dest = path.join(tmpBase, 'cpmed_rs_' + Date.now());
        await rust.copyDirectory(copyMedSrc, dest);
        await fsp.rm(dest, { recursive: true, force: true });
      },
      10,
      2
    );
    console.log(`  TS:   p50=${fmt(tsCopyMed.p50)} p95=${fmt(tsCopyMed.p95)}`);
    console.log(`  Rust: p50=${fmt(rustCopyMed.p50)} p95=${fmt(rustCopyMed.p95)}`);
    console.log(`  Speedup: ${speedup(tsCopyMed.p50, rustCopyMed.p50)}`);

    // ================================================================
    // 6. verifyDirectoryStructure — 50 files
    // ================================================================
    console.log('\n--- verifyDirectoryStructure (50 files) ---');
    const vDir1 = path.join(tmpBase, 'verify1');
    const vDir2 = path.join(tmpBase, 'verify2');
    await createFixtureTree(vDir1, 50, 3);
    await tsCopyDirectoryRecursively(vDir1, vDir2);

    const tsVerify = await benchAsync(async () => {
      await tsVerifyDirectoryFiles(vDir1, vDir2);
    });
    const rustVerify = await benchAsync(async () => {
      await rust.verifyDirectoryStructure(vDir1, vDir2);
    });
    console.log(`  TS:   p50=${fmt(tsVerify.p50)} p95=${fmt(tsVerify.p95)}`);
    console.log(`  Rust: p50=${fmt(rustVerify.p50)} p95=${fmt(rustVerify.p95)}`);
    console.log(`  Speedup: ${speedup(tsVerify.p50, rustVerify.p50)}`);

    // ================================================================
    // 7. ensureDir (sync) — existing directory
    // ================================================================
    console.log('\n--- ensureDir (existing dir, sync) ---');
    const existingDir = path.join(tmpBase, 'ensure_existing');
    fs.mkdirSync(existingDir, { recursive: true });

    const tsEnsure = benchSync(() => {
      tsEnsureDirectory(existingDir);
    });
    const rustEnsure = benchSync(() => {
      rust.ensureDir(existingDir);
    });
    console.log(`  TS:   p50=${fmt(tsEnsure.p50)} p95=${fmt(tsEnsure.p95)}`);
    console.log(`  Rust: p50=${fmt(rustEnsure.p50)} p95=${fmt(rustEnsure.p95)}`);
    console.log(`  Speedup: ${speedup(tsEnsure.p50, rustEnsure.p50)}`);

    // ================================================================
    // 8. ensureDir (sync) — create new nested
    // ================================================================
    console.log('\n--- ensureDir (new nested dir, sync) ---');
    let counter = 0;
    const tsEnsureNew = benchSync(() => {
      const d = path.join(tmpBase, 'ensure_ts', `d_${counter++}`, 'nested');
      tsEnsureDirectory(d);
    });
    counter = 0;
    const rustEnsureNew = benchSync(() => {
      const d = path.join(tmpBase, 'ensure_rs', `d_${counter++}`, 'nested');
      rust.ensureDir(d);
    });
    console.log(`  TS:   p50=${fmt(tsEnsureNew.p50)} p95=${fmt(tsEnsureNew.p95)}`);
    console.log(`  Rust: p50=${fmt(rustEnsureNew.p50)} p95=${fmt(rustEnsureNew.p95)}`);
    console.log(`  Speedup: ${speedup(tsEnsureNew.p50, rustEnsureNew.p50)}`);

    // ================================================================
    // Memory comparison — readDirectoryTree large
    // ================================================================
    console.log('\n--- Memory: readDirectoryTree (2000 files) ---');
    global.gc?.();
    const memBefore = process.memoryUsage().heapUsed;
    for (let i = 0; i < 10; i++) {
      await tsReadDirectoryRecursive(largeDir, { maxDepth: 15 });
    }
    const tsMemDelta = process.memoryUsage().heapUsed - memBefore;

    global.gc?.();
    const memBefore2 = process.memoryUsage().heapUsed;
    for (let i = 0; i < 10; i++) {
      await rust.readDirectoryTree(largeDir, largeDir, 15);
    }
    const rustMemDelta = process.memoryUsage().heapUsed - memBefore2;

    console.log(`  TS heap delta:   ${(tsMemDelta / 1024).toFixed(1)} KB`);
    console.log(`  Rust heap delta: ${(rustMemDelta / 1024).toFixed(1)} KB`);
    if (rustMemDelta > 0 && tsMemDelta > 0) {
      console.log(`  Reduction: ${(tsMemDelta / rustMemDelta).toFixed(1)}x`);
    }

    console.log('\n=== Benchmark complete ===');
  } finally {
    await fsp.rm(tmpBase, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch(console.error);
