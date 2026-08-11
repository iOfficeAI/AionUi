import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function listFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

function findLatestAppAsarUnderOut(): string | null {
  const outDir = path.resolve(__dirname, '../../out');
  if (!fs.existsSync(outDir)) return null;

  const files = listFilesRecursive(outDir);
  const asarFiles = files.filter((file) => path.basename(file) === 'app.asar');
  if (asarFiles.length === 0) return null;

  asarFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return asarFiles[0] || null;
}

function getLatestFileMtimeMs(dir: string): number {
  const files = listFilesRecursive(dir);
  let latest = 0;

  for (const file of files) {
    const mtimeMs = fs.statSync(file).mtimeMs;
    if (mtimeMs > latest) {
      latest = mtimeMs;
    }
  }

  return latest;
}

function resolveDefaultAppAsarPath(): string | null {
  const appAsarPath = findLatestAppAsarUnderOut();
  if (!appAsarPath) return null;

  const rendererDir = path.resolve(__dirname, '../../out/renderer');
  if (!fs.existsSync(rendererDir)) {
    return appAsarPath;
  }

  const rendererLatestMtime = getLatestFileMtimeMs(rendererDir);
  const asarMtime = fs.statSync(appAsarPath).mtimeMs;

  // If renderer build artifacts are newer than app.asar, the package is stale.
  // Skip in that case to avoid false negatives caused by hash mismatch.
  if (rendererLatestMtime > asarMtime + 1000) {
    return null;
  }

  return appAsarPath;
}

function getAsarEntries(asarPath: string): Set<string> {
  const candidates = process.platform === 'win32' ? ['bunx.cmd', 'bunx', 'npx.cmd', 'npx'] : ['bunx', 'npx'];
  let output = '';

  for (const cmd of candidates) {
    try {
      const args = cmd.startsWith('bunx') ? ['--bun', 'asar', 'list', asarPath] : ['--yes', 'asar', 'list', asarPath];
      output = execFileSync(cmd, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
      });

      if (output.trim()) break;
    } catch {
      // Try next command candidate
    }
  }

  if (!output.trim()) {
    throw new Error('Failed to list app.asar entries via bunx/npx asar');
  }

  return new Set(
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => toPosixPath(line).replace(/^\//, ''))
  );
}

function getExpectedRendererFiles(): string[] {
  const rendererDir = path.resolve(__dirname, '../../out/renderer');
  if (!fs.existsSync(rendererDir)) {
    throw new Error(`Renderer output directory not found: ${rendererDir}`);
  }

  return listFilesRecursive(rendererDir)
    .map((file) => toPosixPath(path.relative(path.resolve(__dirname, '../..'), file)))
    .filter((file) => !file.endsWith('.map'));
}

describe('Packaged i18n build integrity', () => {
  const envAsar = process.env.APP_ASAR_PATH;
  const resolvedEnvAsar = envAsar ? path.resolve(envAsar) : null;

  if (resolvedEnvAsar && !fs.existsSync(resolvedEnvAsar)) {
    throw new Error(`APP_ASAR_PATH does not exist: ${resolvedEnvAsar}`);
  }

  const appAsarPath = resolvedEnvAsar || resolveDefaultAppAsarPath();
  const rendererDir = path.resolve(__dirname, '../../out/renderer');
  const hasRendererDir = fs.existsSync(rendererDir);
  const runOrSkip = appAsarPath && hasRendererDir ? it : it.skip;

  runOrSkip('should include all renderer build files in app.asar', () => {
    const expectedFiles = getExpectedRendererFiles();
    const asarEntries = getAsarEntries(appAsarPath as string);

    const missing = expectedFiles.filter((file) => !asarEntries.has(file));

    expect(missing).toEqual([]);
  });
});
