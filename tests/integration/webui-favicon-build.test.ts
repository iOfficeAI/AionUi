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

function getLatestSourceMtimeMs(files: string[]): number {
  return files.reduce((latest, file) => {
    if (!fs.existsSync(file)) return latest;
    return Math.max(latest, fs.statSync(file).mtimeMs);
  }, 0);
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

function extractFaviconHref(indexHtmlPath: string): string {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const match = html.match(/<link\s+rel="icon"[^>]*href="([^"]+)"/i);
  if (!match?.[1]) {
    throw new Error(`Favicon link not found in ${indexHtmlPath}`);
  }
  return match[1];
}

describe('Built WebUI favicon integrity', () => {
  const rendererIndexPath = path.resolve(__dirname, '../../out/renderer/index.html');
  const faviconSourceFiles = [
    path.resolve(__dirname, '../../src/renderer/index.html'),
    path.resolve(__dirname, '../../resources/icon.png'),
  ];
  const envAsar = process.env.APP_ASAR_PATH;
  const resolvedEnvAsar = envAsar ? path.resolve(envAsar) : null;
  const latestSourceMtime = getLatestSourceMtimeMs(faviconSourceFiles);
  const hasFreshRendererBuild =
    fs.existsSync(rendererIndexPath) && fs.statSync(rendererIndexPath).mtimeMs >= latestSourceMtime;

  if (resolvedEnvAsar && !fs.existsSync(resolvedEnvAsar)) {
    throw new Error(`APP_ASAR_PATH does not exist: ${resolvedEnvAsar}`);
  }

  const appAsarPath = resolvedEnvAsar || resolveDefaultAppAsarPath();
  const runOrSkip = hasFreshRendererBuild ? it : it.skip;

  runOrSkip('should include the built favicon asset referenced by renderer index.html', () => {
    const faviconHref = extractFaviconHref(rendererIndexPath);

    expect(faviconHref).toMatch(/^\.\/(assets|pwa)\/.+\.(png|ico|svg)$/);

    const assetRelativePath = toPosixPath(path.join('out/renderer', faviconHref.replace(/^\.\//, '')));
    const assetAbsolutePath = path.resolve(path.dirname(rendererIndexPath), faviconHref);

    expect(fs.existsSync(assetAbsolutePath)).toBe(true);

    if (appAsarPath) {
      const asarEntries = getAsarEntries(appAsarPath);
      expect(asarEntries.has(assetRelativePath)).toBe(true);
    }
  });
});
