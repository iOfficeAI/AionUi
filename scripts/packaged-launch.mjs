#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

function parseArgs(argv) {
  const flags = new Set(argv.filter((x) => x.startsWith('--')));
  const values = argv.filter((x) => !x.startsWith('--'));
  return { flags, values };
}

function isWindows() {
  return process.platform === 'win32';
}

function killProcessByName(name) {
  return new Promise((resolve) => {
    const args = isWindows() ? ['/F', '/IM', name] : ['-f', name];
    const cmd = isWindows() ? 'taskkill' : 'pkill';
    const child = spawn(cmd, args, { stdio: 'ignore', shell: false });
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}

function resolvePackagedApp(projectRoot) {
  const outDir = path.join(projectRoot, 'out');
  if (!fs.existsSync(outDir)) return null;

  if (process.platform === 'win32') {
    for (const dir of ['win-unpacked', 'win-x64-unpacked', 'win-arm64-unpacked']) {
      const exe = path.join(outDir, dir, 'AionUi.exe');
      if (fs.existsSync(exe)) return { executablePath: exe, cwd: path.join(outDir, dir) };
    }
  } else if (process.platform === 'darwin') {
    for (const dir of ['mac-arm64', 'mac-x64', 'mac', 'mac-universal']) {
      const macDir = path.join(outDir, dir);
      if (!fs.existsSync(macDir)) continue;
      const appBundle = fs.readdirSync(macDir).find((f) => f.endsWith('.app'));
      if (!appBundle) continue;
      const exe = path.join(macDir, appBundle, 'Contents', 'MacOS', 'AionUi');
      if (fs.existsSync(exe)) return { executablePath: exe, cwd: macDir };
    }
  } else {
    for (const dir of ['linux-unpacked', 'linux-x64-unpacked', 'linux-arm64-unpacked']) {
      const dirPath = path.join(outDir, dir);
      if (!fs.existsSync(dirPath)) continue;
      for (const name of ['aionui', 'AionUi']) {
        const exe = path.join(dirPath, name);
        if (fs.existsSync(exe)) return { executablePath: exe, cwd: dirPath };
      }
    }
  }

  return null;
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const dryRun = flags.has('--dry-run');
  const shouldClean = !flags.has('--no-clean');
  const passthroughArgs = values;

  const packaged = resolvePackagedApp(projectRoot);
  if (!packaged) {
    console.error('[packaged-launch] No unpacked app found under out/. Run `just build-package` first.');
    process.exit(1);
  }

  if (shouldClean) {
    await killProcessByName('AionUi.exe');
    await killProcessByName('AionUi');
    await killProcessByName('electron.exe');
    await killProcessByName('electron');
  }

  const env = {
    ...process.env,
    AIONUI_EXTENSIONS_PATH: path.join(projectRoot, 'examples'),
  };

  console.log(`[packaged-launch] executable: ${packaged.executablePath}`);
  console.log(`[packaged-launch] cwd: ${packaged.cwd}`);
  console.log(`[packaged-launch] AIONUI_EXTENSIONS_PATH: ${env.AIONUI_EXTENSIONS_PATH}`);

  if (dryRun) return;

  const child = spawn(packaged.executablePath, passthroughArgs, {
    cwd: packaged.cwd,
    env,
    stdio: 'inherit',
    shell: false,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error('[packaged-launch] Failed:', error);
  process.exit(1);
});
