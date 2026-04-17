// src/process/acp/infra/processUtils.ts
import { type ChildProcess } from 'node:child_process';

export function splitCommandLine(cmd: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const char of cmd) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (escaping) current += '\\';
  if (quote) throw new Error('splitCommandLine: unterminated quote');
  if (current.length > 0) parts.push(current);
  if (parts.length === 0) throw new Error('splitCommandLine: empty command');
  return parts;
}

export function waitForSpawn(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSpawn = () => {
      child.off('error', onError);
      resolve();
    };
    const onError = (err: Error) => {
      child.off('spawn', onSpawn);
      reject(err);
    };
    child.once('spawn', onSpawn);
    child.once('error', onError);
  });
}

export function waitForExit(child: ChildProcess, timeoutMs: number): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      child.off('exit', onExit);
      child.off('close', onExit);
      clearTimeout(timer);
      resolve(value);
    };

    const onExit = (code: number | null) => finish(code);

    const timer = setTimeout(() => finish(null), timeoutMs);

    child.once('exit', onExit);
    child.once('close', onExit);
  });
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function gracefulShutdown(child: ChildProcess, gracePeriodMs = 100): Promise<void> {
  if (child.stdin && !child.stdin.destroyed) {
    child.stdin.end();
  }
  const code1 = await waitForExit(child, gracePeriodMs);
  if (code1 !== null) return;

  try {
    child.kill('SIGTERM');
  } catch {
    /* already dead */
  }
  const code2 = await waitForExit(child, 1500);
  if (code2 !== null) return;

  try {
    child.kill('SIGKILL');
  } catch {
    /* already dead */
  }
  await waitForExit(child, 1000);
  child.unref();
}

export function prepareCleanEnv(
  customEnv?: Record<string, string>,
  baseEnv: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined && !key.startsWith('ELECTRON_')) {
      clean[key] = value;
    }
  }
  if (customEnv) Object.assign(clean, customEnv);
  return clean;
}
