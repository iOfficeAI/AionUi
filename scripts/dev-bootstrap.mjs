#!/usr/bin/env node
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_PORTS = [5173, 9230];
const KILLABLE_NAMES = new Set(['electron', 'aionui', 'aionui.exe']);

const log = (...args) => console.log('[dev-bootstrap]', ...args);
const warn = (...args) => console.warn('[dev-bootstrap]', ...args);

function run(command) {
  return execSync(command, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
}

function isWindows() {
  return process.platform === 'win32';
}

function parseArgs(argv) {
  const [command = 'doctor', ...rest] = argv;
  const flags = new Set(rest.filter((x) => x.startsWith('--')));
  const values = rest.filter((x) => !x.startsWith('--'));
  return { command, values, flags };
}

function getPidsListeningOnPort(port) {
  try {
    if (isWindows()) {
      const output = run(`netstat -ano -p tcp | findstr :${port}`);
      const lines = output.split(/\r?\n/).filter(Boolean);
      const pids = new Set();
      for (const line of lines) {
        if (!/\bLISTENING\b/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        if (Number.isFinite(pid) && pid > 0) pids.add(pid);
      }
      return [...pids];
    }

    const output = run(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t || true`);
    return output
      .split(/\r?\n/)
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x) && x > 0);
  } catch {
    return [];
  }
}

function getProcessName(pid) {
  try {
    if (isWindows()) {
      const output = run(
        `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName"`
      );
      return output.trim();
    }
    const output = run(`ps -p ${pid} -o comm=`);
    return path.basename(output.trim());
  } catch {
    return '';
  }
}

function listLikelyConflictingProcesses() {
  try {
    if (isWindows()) {
      const output = run(
        "powershell -NoProfile -Command \"Get-Process | Where-Object { $_.ProcessName -in @('electron','AionUi','node','bun') } | Select-Object ProcessName,Id | ConvertTo-Json -Compress\""
      );
      const parsed = output ? JSON.parse(output) : [];
      return Array.isArray(parsed) ? parsed : [parsed];
    }

    const output = run(`ps -A -o pid=,comm= | egrep "electron|AionUi|node|bun" || true`);
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [pidRaw, ...nameParts] = line.trim().split(/\s+/);
        return { Id: Number(pidRaw), ProcessName: nameParts.join(' ') };
      })
      .filter((x) => Number.isFinite(x.Id));
  } catch {
    return [];
  }
}

function killPid(pid) {
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

function cleanupPorts(ports) {
  const killed = [];
  for (const port of ports) {
    const pids = getPidsListeningOnPort(port);
    for (const pid of pids) {
      const name = (getProcessName(pid) || '').toLowerCase();
      if (!name) continue;
      if (!KILLABLE_NAMES.has(name) && name !== 'node' && name !== 'bun') continue;
      if (killPid(pid)) {
        killed.push({ pid, port, name });
      }
    }
  }
  return killed;
}

function cleanupByName() {
  const processes = listLikelyConflictingProcesses();
  const killed = [];
  for (const proc of processes) {
    const pid = Number(proc.Id ?? proc.id);
    const rawName = String(proc.ProcessName ?? proc.name ?? '').toLowerCase();
    if (!pid || pid === process.pid) continue;
    if (!['electron', 'aionui'].some((k) => rawName.includes(k))) continue;
    if (killPid(pid)) {
      killed.push({ pid, name: rawName });
    }
  }
  return killed;
}

function doctor() {
  log(`platform=${process.platform} node=${process.version}`);
  try {
    log(`bun=${run('bun --version')}`);
  } catch {
    warn('bun not found in PATH');
  }
  const listeners = DEFAULT_PORTS.map((port) => ({
    port,
    pids: getPidsListeningOnPort(port),
  }));
  for (const item of listeners) {
    if (item.pids.length === 0) {
      log(`port ${item.port}: free`);
      continue;
    }
    const names = item.pids.map((pid) => `${pid}:${getProcessName(pid) || 'unknown'}`).join(', ');
    warn(`port ${item.port}: occupied by ${names}`);
  }
}

function launch(scriptName, withExtensions) {
  if (!scriptName) {
    throw new Error(
      'Missing script name. Usage: node scripts/dev-bootstrap.mjs launch <start|webui|cli> [--extensions]'
    );
  }

  const killedByName = cleanupByName();
  const killedByPort = cleanupPorts(DEFAULT_PORTS);
  if (killedByName.length > 0 || killedByPort.length > 0) {
    log(`killed ${killedByName.length + killedByPort.length} stale process(es)`);
  }

  const env = { ...process.env };
  if (withExtensions) {
    env.AIONUI_EXTENSIONS_PATH = path.resolve(process.cwd(), 'examples');
    log(`AIONUI_EXTENSIONS_PATH=${env.AIONUI_EXTENSIONS_PATH}`);
  }

  const child = spawn('bun', ['run', scriptName], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: isWindows(),
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

function main() {
  const { command, values, flags } = parseArgs(process.argv.slice(2));

  if (command === 'doctor') {
    doctor();
    return;
  }

  if (command === 'launch') {
    launch(values[0], flags.has('--extensions'));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main();
