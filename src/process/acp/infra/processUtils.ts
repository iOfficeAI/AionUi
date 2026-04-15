// src/process/acp/infra/processUtils.ts
import { type ChildProcess } from 'node:child_process';

export function splitCommandLine(cmd: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (const char of cmd) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }
    if (char === '\\' && !inSingle) {
      escape = true;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === ' ' && !inSingle && !inDouble) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) args.push(current);
  return args;
}

export function waitForSpawn(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('spawn', () => resolve());
    child.once('error', (err) => reject(err));
  });
}

export function waitForExit(child: ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeAllListeners('exit');
      resolve(null);
    }, timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
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
