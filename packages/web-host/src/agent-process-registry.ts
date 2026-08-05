import { spawn } from 'node:child_process';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

type RegisteredAgentProcess = {
  pid: number;
  process_group_id?: number;
  conversation_id: string;
  agent_type: string;
  backend?: string;
  command_preview?: string;
  registered_at_ms: number;
};

type AgentProcessRegistry = {
  version: number;
  processes: RegisteredAgentProcess[];
};

export const AGENT_PROCESS_REGISTRY_RELATIVE_PATH = path.join('runtime', 'agent-process-registry.json');

const TERM_GRACE_MS = 1_000;

let registryFileCounter = 0;

function nextRegistryFileCounter(): number {
  registryFileCounter += 1;
  return registryFileCounter;
}

export function resolveAgentProcessRegistryPath(dataDir: string): string {
  return path.join(dataDir, AGENT_PROCESS_REGISTRY_RELATIVE_PATH);
}

export async function cleanupRegisteredAgentProcesses(dataDir?: string): Promise<void> {
  if (!dataDir) return;

  try {
    await cleanupRegisteredAgentProcessesInner(dataDir);
  } catch (error) {
    // Orphan reaping is best-effort bookkeeping: no failure here may abort
    // the application stop flow (backend-launcher stop() has no catch).
    console.warn('[web-host] agent process cleanup failed; continuing shutdown', error);
  }
}

async function cleanupRegisteredAgentProcessesInner(dataDir: string): Promise<void> {
  const registryPath = resolveAgentProcessRegistryPath(dataDir);
  const registry = await readRegistry(registryPath);
  if (registry.processes.length === 0) return;

  for (const entry of registry.processes) {
    await terminateRegisteredProcess(entry, 'SIGTERM');
  }

  await delay(TERM_GRACE_MS);

  for (const entry of registry.processes) {
    if (isRegisteredProcessTreeAlive(entry)) {
      await terminateRegisteredProcess(entry, 'SIGKILL');
    }
  }

  // Re-read before writing back: entries registered concurrently by another
  // backend during the kill sequence (seconds) must survive. Only pids we
  // attempted to kill this round are filtered down to the still-alive ones;
  // untouched entries are kept verbatim. This shrinks the lock-free RMW loss
  // window from the whole kill sequence to the re-read→rename gap.
  const attempted = new Set(registry.processes.map((entry) => entry.pid));
  const latest = await readRegistry(registryPath);
  const survivors = latest.processes.filter(
    (entry) => !attempted.has(entry.pid) || isRegisteredProcessTreeAlive(entry)
  );
  await writeRegistry(registryPath, {
    version: latest.version,
    processes: survivors,
  });
}

async function readRegistry(registryPath: string): Promise<AgentProcessRegistry> {
  let raw: string;
  try {
    raw = await readFile(registryPath, 'utf8');
  } catch (error) {
    if (isNotFound(error)) {
      return {
        version: 1,
        processes: [],
      };
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AgentProcessRegistry>;
    return {
      version: parsed.version ?? 1,
      processes: Array.isArray(parsed.processes) ? parsed.processes.filter(isRegisteredProcess) : [],
    };
  } catch (error) {
    // Fail-safe on corruption: the registry is pure bookkeeping for orphan
    // reaping, so a torn/empty file must not abort shutdown cleanup.
    // Quarantine it for forensics and continue with an empty registry.
    console.warn(
      `[web-host] agent process registry ${registryPath} is corrupt; quarantining and continuing empty`,
      error
    );
    await quarantineCorruptRegistry(registryPath);
    return {
      version: 1,
      processes: [],
    };
  }
}

async function quarantineCorruptRegistry(registryPath: string): Promise<void> {
  const quarantinePath = path.join(
    path.dirname(registryPath),
    `.${path.basename(registryPath)}.corrupt.${process.pid}.${nextRegistryFileCounter()}`
  );
  try {
    await rename(registryPath, quarantinePath);
  } catch (error) {
    console.warn(`[web-host] failed to quarantine corrupt agent process registry ${registryPath}`, error);
  }
}

async function writeRegistry(registryPath: string, registry: AgentProcessRegistry): Promise<void> {
  await mkdir(path.dirname(registryPath), { recursive: true });
  // pid+counter namespaced temp: a sibling backend writing the same registry
  // can never clobber our in-flight temp (fixed-name temps were one of the
  // corruption sources behind ELECTRON-3WN).
  const tmpPath = `${registryPath}.${process.pid}.${nextRegistryFileCounter()}.tmp`;
  const payload = `${JSON.stringify(registry, null, 2)}\n`;

  const handle = await open(tmpPath, 'w');
  try {
    await handle.writeFile(payload, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await rename(tmpPath, registryPath);
  } catch {
    // Windows can refuse to rename over a concurrently open target; retry
    // once after a best-effort removal instead of unconditionally deleting
    // the live registry up front.
    try {
      await rm(registryPath, { force: true });
      await rename(tmpPath, registryPath);
    } catch (retryError) {
      await rm(tmpPath, { force: true });
      throw retryError;
    }
  }
}

async function terminateRegisteredProcess(entry: RegisteredAgentProcess, signal: 'SIGTERM' | 'SIGKILL'): Promise<void> {
  if (process.platform === 'win32') {
    if (!isProcessAlive(entry.pid)) return;
    await runTaskkill(entry.pid, signal === 'SIGKILL');
    return;
  }

  const target = entry.process_group_id ?? entry.pid;
  try {
    process.kill(-target, signal);
  } catch {
    try {
      process.kill(entry.pid, signal);
    } catch {
      // already exited
    }
  }
}

function isRegisteredProcessTreeAlive(entry: RegisteredAgentProcess): boolean {
  if (process.platform !== 'win32' && typeof entry.process_group_id === 'number' && entry.process_group_id > 1) {
    try {
      process.kill(-entry.process_group_id, 0);
      return true;
    } catch {
      // fall through to wrapper PID check
    }
  }

  return isProcessAlive(entry.pid);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isRegisteredProcess(value: unknown): value is RegisteredAgentProcess {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RegisteredAgentProcess).pid === 'number' &&
    typeof (value as RegisteredAgentProcess).conversation_id === 'string' &&
    typeof (value as RegisteredAgentProcess).agent_type === 'string' &&
    typeof (value as RegisteredAgentProcess).registered_at_ms === 'number'
  );
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runTaskkill(pid: number, force: boolean): Promise<void> {
  return new Promise((resolve) => {
    const args = ['/PID', String(pid), '/T'];
    if (force) args.unshift('/F');

    try {
      const child = spawn('taskkill', args, {
        stdio: 'ignore',
        windowsHide: true,
      });
      child.once('error', () => resolve());
      child.once('exit', () => resolve());
    } catch {
      resolve();
    }
  });
}
