/**
 * Benchmark: TypeScript vs Rust credential-crypto implementations
 * Run with: bunx tsx tests/bench/cred-bench.ts
 */
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import process from 'node:process';

import * as ts from '../../src/process/channels/utils/credentialCrypto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rust = require('@aionui/native') as typeof ts;

const ITERATIONS = 10_000;
const WARMUP = 1_000;

type BenchResult = { p50: number; p95: number; p99: number };

function bench(name: string, fn: () => void): BenchResult {
  // Warmup
  for (let i = 0; i < WARMUP; i++) fn();

  // Measure
  const times: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
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

function formatMs(ms: number): string {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(0)}ns`;
  if (ms < 1) return `${(ms * 1_000).toFixed(1)}us`;
  return `${ms.toFixed(3)}ms`;
}

function speedup(tsMs: number, rustMs: number): string {
  if (rustMs === 0 || tsMs === 0) return 'N/A';
  const ratio = tsMs / rustMs;
  return `${ratio.toFixed(1)}x`;
}

// Test data
const shortStr = 'my-secret-token-abc123';
const longStr = 'a'.repeat(10_000);
const b64Short = ts.encryptString(shortStr);
const b64Long = ts.encryptString(longStr);
const encLegacy = `enc:${Buffer.from(shortStr, 'utf-8').toString('base64')}`;
const creds = { token: 'my-secret-token', name: 'test-plugin', enabled: true, apiKey: 'sk-123456' };

// Environment info
console.log('=== Benchmark: credential-crypto (TS vs Rust) ===\n');
console.log(`OS:      ${os.type()} ${os.release()} ${os.arch()}`);
console.log(`CPU:     ${os.cpus()[0]?.model} (${os.cpus().length} cores)`);
console.log(`RAM:     ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`);
console.log(`Node.js: ${process.version}`);

// Run benchmarks
const results: Array<{
  operation: string;
  ts: BenchResult;
  rust: BenchResult;
}> = [];

const ops: Array<{ name: string; tsFn: () => void; rustFn: () => void }> = [
  {
    name: 'encryptString (short)',
    tsFn: () => ts.encryptString(shortStr),
    rustFn: () => rust.encryptString(shortStr),
  },
  {
    name: 'encryptString (10KB)',
    tsFn: () => ts.encryptString(longStr),
    rustFn: () => rust.encryptString(longStr),
  },
  {
    name: 'decryptString (b64 short)',
    tsFn: () => ts.decryptString(b64Short),
    rustFn: () => rust.decryptString(b64Short),
  },
  {
    name: 'decryptString (b64 10KB)',
    tsFn: () => ts.decryptString(b64Long),
    rustFn: () => rust.decryptString(b64Long),
  },
  {
    name: 'decryptString (enc legacy)',
    tsFn: () => ts.decryptString(encLegacy),
    rustFn: () => rust.decryptString(encLegacy),
  },
  {
    name: 'encryptCredentials',
    tsFn: () => ts.encryptCredentials({ ...creds }),
    rustFn: () => rust.encryptCredentials({ ...creds }),
  },
  {
    name: 'decryptCredentials',
    tsFn: () => {
      const enc = ts.encryptCredentials({ ...creds })!;
      ts.decryptCredentials(enc);
    },
    rustFn: () => {
      const enc = rust.encryptCredentials({ ...creds })!;
      rust.decryptCredentials(enc);
    },
  },
];

for (const op of ops) {
  const tsResult = bench(`TS ${op.name}`, op.tsFn);
  const rustResult = bench(`Rust ${op.name}`, op.rustFn);
  results.push({ operation: op.name, ts: tsResult, rust: rustResult });
}

// Memory benchmark
const MEMORY_CYCLES = 10_000;
const memBefore = process.memoryUsage().heapUsed;
for (let i = 0; i < MEMORY_CYCLES; i++) {
  const enc = ts.encryptCredentials({ ...creds })!;
  ts.decryptCredentials(enc);
}
const tsHeapDelta = process.memoryUsage().heapUsed - memBefore;

// Force GC if available
if (global.gc) global.gc();

const memBefore2 = process.memoryUsage().heapUsed;
for (let i = 0; i < MEMORY_CYCLES; i++) {
  const enc = rust.encryptCredentials({ ...creds })!;
  rust.decryptCredentials(enc);
}
const rustHeapDelta = process.memoryUsage().heapUsed - memBefore2;

// Print results
console.log(`\nIterations: ${ITERATIONS} (warmup: ${WARMUP})\n`);
console.log(
  '| Operation | TS p50 | TS p95 | Rust p50 | Rust p95 | Speedup (p50) |',
);
console.log(
  '|-----------|--------|--------|----------|----------|---------------|',
);
for (const r of results) {
  console.log(
    `| ${r.operation.padEnd(27)} | ${formatMs(r.ts.p50).padStart(6)} | ${formatMs(r.ts.p95).padStart(6)} | ${formatMs(r.rust.p50).padStart(8)} | ${formatMs(r.rust.p95).padStart(8)} | ${speedup(r.ts.p50, r.rust.p50).padStart(13)} |`,
  );
}

console.log(`\nMemory (${MEMORY_CYCLES} encrypt+decrypt cycles):`);
console.log(`  TS heap delta:   ${(tsHeapDelta / 1024).toFixed(1)} KB`);
console.log(`  Rust heap delta: ${(rustHeapDelta / 1024).toFixed(1)} KB`);

// Output machine-readable JSON for doc-sync
const output = {
  environment: {
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    ram_gb: +(os.totalmem() / 1024 / 1024 / 1024).toFixed(1),
    node: process.version,
    iterations: ITERATIONS,
  },
  results: results.map((r) => ({
    operation: r.operation,
    ts_p50_ms: r.ts.p50,
    ts_p95_ms: r.ts.p95,
    rust_p50_ms: r.rust.p50,
    rust_p95_ms: r.rust.p95,
    speedup_p50: +(r.ts.p50 / r.rust.p50).toFixed(2),
  })),
  memory: {
    cycles: MEMORY_CYCLES,
    ts_heap_delta_kb: +(tsHeapDelta / 1024).toFixed(1),
    rust_heap_delta_kb: +(rustHeapDelta / 1024).toFixed(1),
  },
};

console.log('\n--- JSON ---');
console.log(JSON.stringify(output, null, 2));
