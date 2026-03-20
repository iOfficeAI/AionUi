/**
 * Benchmark: TypeScript vs Rust auth implementations
 * Run with: bunx tsx tests/bench/auth-bench.ts
 */
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import process from 'node:process';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Rust implementation
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rust = require('@aionui/native') as {
  hashPassword: (password: string) => Promise<string>;
  verifyPassword: (password: string, hash: string) => Promise<boolean>;
  generateToken: (payload: { userId: string; username: string }, secret: string, expiresIn: string) => string;
  verifyJwt: (token: string, secret: string) => { userId: string; username: string } | null;
  validateUsername: (username: string) => { isValid: boolean; errors: string[] };
  validatePasswordStrength: (password: string) => { isValid: boolean; errors: string[] };
  generateRandomPassword: () => string;
  generateUserCredentials: () => { username: string; password: string; createdAt: number };
  generateSessionId: () => string;
  generateSecretKey: () => string;
  constantTimeCompare: (a: string, b: string) => boolean;
  sha256Hex: (input: string) => string;
};

// --- TS reference implementations ---

const tsHashPassword = (password: string): Promise<string> =>
  new Promise((resolve, reject) => {
    bcrypt.hash(password, 12, (error, hash) => (error ? reject(error) : resolve(hash)));
  });

const tsVerifyPassword = (password: string, hash: string): Promise<boolean> =>
  new Promise((resolve, reject) => {
    bcrypt.compare(password, hash, (error, same) => (error ? reject(error) : resolve(same)));
  });

// --- Bench utilities ---

const SYNC_ITERATIONS = 10_000;
const SYNC_WARMUP = 1_000;
const ASYNC_ITERATIONS = 50;
const ASYNC_WARMUP = 5;

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

async function benchAsync(fn: () => Promise<unknown>, iterations: number, warmup: number): Promise<BenchResult> {
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

function formatMs(ms: number): string {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(0)}ns`;
  if (ms < 1) return `${(ms * 1_000).toFixed(1)}us`;
  return `${ms.toFixed(3)}ms`;
}

function speedup(tsMs: number, rustMs: number): string {
  if (rustMs === 0 || tsMs === 0) return 'N/A';
  const ratio = tsMs / rustMs;
  if (ratio < 1) return `${(1 / ratio).toFixed(1)}x slower`;
  return `${ratio.toFixed(1)}x`;
}

// --- Main ---

async function main() {
  console.log('=== Benchmark: auth module (TS vs Rust) ===\n');
  console.log(`OS:      ${os.type()} ${os.release()} ${os.arch()}`);
  console.log(`CPU:     ${os.cpus()[0]?.model} (${os.cpus().length} cores)`);
  console.log(`RAM:     ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`);
  console.log(`Node.js: ${process.version}`);

  const jwtSecret = crypto.randomBytes(64).toString('hex');
  const testPassword = 'MyBenchm@rk!Pass123';
  const testPayload = { userId: 'auth_1234567890_abc', username: 'benchuser' };

  // Pre-generate hashes for verify benchmarks
  const bcryptHash = await tsHashPassword(testPassword);
  const argon2Hash = await rust.hashPassword(testPassword);

  // Pre-generate tokens for verify benchmarks
  const tsToken = jwt.sign(testPayload, jwtSecret, {
    expiresIn: '24h',
    issuer: 'aionui',
    audience: 'aionui-webui',
  });
  const rustToken = rust.generateToken(testPayload, jwtSecret, '24h');

  const results: Array<{
    operation: string;
    ts: BenchResult;
    rust: BenchResult;
    iterations: number;
  }> = [];

  // --- Async operations (password hashing/verification) ---
  console.log('\nRunning async benchmarks (password ops)...');

  const tsHash = await benchAsync(() => tsHashPassword(testPassword), ASYNC_ITERATIONS, ASYNC_WARMUP);
  const rustHash = await benchAsync(() => rust.hashPassword(testPassword), ASYNC_ITERATIONS, ASYNC_WARMUP);
  results.push({ operation: 'hashPassword', ts: tsHash, rust: rustHash, iterations: ASYNC_ITERATIONS });

  const tsVerifyBcrypt = await benchAsync(
    () => tsVerifyPassword(testPassword, bcryptHash),
    ASYNC_ITERATIONS,
    ASYNC_WARMUP
  );
  const rustVerifyBcrypt = await benchAsync(
    () => rust.verifyPassword(testPassword, bcryptHash),
    ASYNC_ITERATIONS,
    ASYNC_WARMUP
  );
  results.push({
    operation: 'verifyPassword (bcrypt)',
    ts: tsVerifyBcrypt,
    rust: rustVerifyBcrypt,
    iterations: ASYNC_ITERATIONS,
  });

  const rustVerifyArgon2 = await benchAsync(
    () => rust.verifyPassword(testPassword, argon2Hash),
    ASYNC_ITERATIONS,
    ASYNC_WARMUP
  );
  results.push({
    operation: 'verifyPassword (argon2)',
    ts: { p50: NaN, p95: NaN, p99: NaN },
    rust: rustVerifyArgon2,
    iterations: ASYNC_ITERATIONS,
  });

  // --- Sync operations ---
  console.log('Running sync benchmarks...');

  // JWT
  const tsGenToken = benchSync(() =>
    jwt.sign(testPayload, jwtSecret, { expiresIn: '24h', issuer: 'aionui', audience: 'aionui-webui' })
  );
  const rustGenToken = benchSync(() => rust.generateToken(testPayload, jwtSecret, '24h'));
  results.push({ operation: 'generateToken', ts: tsGenToken, rust: rustGenToken, iterations: SYNC_ITERATIONS });

  const tsVerifyToken = benchSync(() => jwt.verify(tsToken, jwtSecret, { issuer: 'aionui', audience: 'aionui-webui' }));
  const rustVerifyToken = benchSync(() => rust.verifyJwt(rustToken, jwtSecret));
  results.push({ operation: 'verifyJwt', ts: tsVerifyToken, rust: rustVerifyToken, iterations: SYNC_ITERATIONS });

  // Validation
  const tsValUn = benchSync(() => {
    const errors: string[] = [];
    if ('benchuser'.length < 3) errors.push('too short');
    if (!/^[a-zA-Z0-9_-]+$/.test('benchuser')) errors.push('invalid');
  });
  const rustValUn = benchSync(() => rust.validateUsername('benchuser'));
  results.push({ operation: 'validateUsername', ts: tsValUn, rust: rustValUn, iterations: SYNC_ITERATIONS });

  const tsValPw = benchSync(() => {
    const errors: string[] = [];
    if (testPassword.length < 8) errors.push('short');
    const weak = ['password', '12345678', '123456789', 'qwertyui', 'abcdefgh'];
    if (weak.includes(testPassword.toLowerCase())) errors.push('weak');
  });
  const rustValPw = benchSync(() => rust.validatePasswordStrength(testPassword));
  results.push({ operation: 'validatePasswordStrength', ts: tsValPw, rust: rustValPw, iterations: SYNC_ITERATIONS });

  // Generation
  const tsGenPw = benchSync(() => {
    const len = 12 + Math.floor(Math.random() * 5);
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let pw = '';
    for (let i = 0; i < len; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  });
  const rustGenPw = benchSync(() => rust.generateRandomPassword());
  results.push({ operation: 'generateRandomPassword', ts: tsGenPw, rust: rustGenPw, iterations: SYNC_ITERATIONS });

  const tsGenSid = benchSync(() => crypto.randomBytes(32).toString('hex'));
  const rustGenSid = benchSync(() => rust.generateSessionId());
  results.push({ operation: 'generateSessionId', ts: tsGenSid, rust: rustGenSid, iterations: SYNC_ITERATIONS });

  const tsGenSk = benchSync(() => crypto.randomBytes(64).toString('hex'));
  const rustGenSk = benchSync(() => rust.generateSecretKey());
  results.push({ operation: 'generateSecretKey', ts: tsGenSk, rust: rustGenSk, iterations: SYNC_ITERATIONS });

  // Crypto
  const tsCtc = benchSync(() => {
    const a = Buffer.from('benchmark-string-a'.padEnd(20, '0'));
    const b = Buffer.from('benchmark-string-b'.padEnd(20, '0'));
    crypto.timingSafeEqual(a, b);
  });
  const rustCtc = benchSync(() => rust.constantTimeCompare('benchmark-string-a00', 'benchmark-string-b00'));
  results.push({ operation: 'constantTimeCompare', ts: tsCtc, rust: rustCtc, iterations: SYNC_ITERATIONS });

  const tsSha = benchSync(() => crypto.createHash('sha256').update('benchmark-token-hash-input').digest('hex'));
  const rustSha = benchSync(() => rust.sha256Hex('benchmark-token-hash-input'));
  results.push({ operation: 'sha256Hex', ts: tsSha, rust: rustSha, iterations: SYNC_ITERATIONS });

  // --- Print results ---
  console.log(`\n| Operation | Iter | TS p50 | TS p95 | Rust p50 | Rust p95 | Speedup (p50) |`);
  console.log('|-----------|------|--------|--------|----------|----------|---------------|');
  for (const r of results) {
    const tsP50 = Number.isNaN(r.ts.p50) ? 'N/A' : formatMs(r.ts.p50).padStart(6);
    const tsP95 = Number.isNaN(r.ts.p95) ? 'N/A' : formatMs(r.ts.p95).padStart(6);
    const sp = Number.isNaN(r.ts.p50) ? 'N/A (Rust only)' : speedup(r.ts.p50, r.rust.p50);
    console.log(
      `| ${r.operation.padEnd(27)} | ${String(r.iterations).padStart(4)} | ${tsP50} | ${tsP95} | ${formatMs(r.rust.p50).padStart(8)} | ${formatMs(r.rust.p95).padStart(8)} | ${sp.padStart(13)} |`
    );
  }

  // Memory benchmark
  console.log('\nMemory benchmark (1000 hashPassword calls)...');
  const MEM_CYCLES = 20;
  if (global.gc) global.gc();
  const memBefore1 = process.memoryUsage().heapUsed;
  for (let i = 0; i < MEM_CYCLES; i++) await tsHashPassword(testPassword);
  const tsHeapDelta = process.memoryUsage().heapUsed - memBefore1;

  if (global.gc) global.gc();
  const memBefore2 = process.memoryUsage().heapUsed;
  for (let i = 0; i < MEM_CYCLES; i++) await rust.hashPassword(testPassword);
  const rustHeapDelta = process.memoryUsage().heapUsed - memBefore2;

  console.log(`  TS heap delta:   ${(tsHeapDelta / 1024).toFixed(1)} KB (${MEM_CYCLES} cycles)`);
  console.log(`  Rust heap delta: ${(rustHeapDelta / 1024).toFixed(1)} KB (${MEM_CYCLES} cycles)`);

  // JSON output
  const output = {
    environment: {
      os: `${os.type()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus()[0]?.model,
      cores: os.cpus().length,
      ram_gb: +(os.totalmem() / 1024 / 1024 / 1024).toFixed(1),
      node: process.version,
    },
    results: results.map((r) => ({
      operation: r.operation,
      iterations: r.iterations,
      ts_p50_ms: r.ts.p50,
      ts_p95_ms: r.ts.p95,
      rust_p50_ms: r.rust.p50,
      rust_p95_ms: r.rust.p95,
      speedup_p50: Number.isNaN(r.ts.p50) ? null : +(r.ts.p50 / r.rust.p50).toFixed(2),
    })),
    memory: {
      cycles: MEM_CYCLES,
      ts_heap_delta_kb: +(tsHeapDelta / 1024).toFixed(1),
      rust_heap_delta_kb: +(rustHeapDelta / 1024).toFixed(1),
    },
  };

  console.log('\n--- JSON ---');
  console.log(JSON.stringify(output, null, 2));
}

main().catch(console.error);
