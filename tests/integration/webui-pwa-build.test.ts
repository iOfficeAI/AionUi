import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { expect, it } from 'vitest';

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

const rendererIndexPath = path.resolve(__dirname, '../../out/renderer/index.html');
const pwaSourceFiles = [
  path.resolve(__dirname, '../../src/renderer/index.html'),
  path.resolve(__dirname, '../../src/renderer/main.tsx'),
  path.resolve(__dirname, '../../src/renderer/services/registerPwa.ts'),
  path.resolve(__dirname, '../../public/manifest.webmanifest'),
  path.resolve(__dirname, '../../public/sw.js'),
];
const envAsar = process.env.APP_ASAR_PATH;
const resolvedEnvAsar = envAsar ? path.resolve(envAsar) : null;
const latestSourceMtime = getLatestSourceMtimeMs(pwaSourceFiles);
const hasFreshRendererBuild =
  fs.existsSync(rendererIndexPath) && fs.statSync(rendererIndexPath).mtimeMs >= latestSourceMtime;

if (resolvedEnvAsar && !fs.existsSync(resolvedEnvAsar)) {
  throw new Error(`APP_ASAR_PATH does not exist: ${resolvedEnvAsar}`);
}

const appAsarPath = resolvedEnvAsar || resolveDefaultAppAsarPath();
const runOrSkip = hasFreshRendererBuild ? it : it.skip;

runOrSkip('includes manifest and apple touch icon links in the built renderer entry', () => {
  const html = fs.readFileSync(rendererIndexPath, 'utf8');

  expect(html).toContain('rel="manifest" href="./manifest.webmanifest"');
  expect(html).toContain('rel="apple-touch-icon" href="./pwa/icon-180.png"');
  expect(html).toContain('name="theme-color" content="#4E5969"');
});

runOrSkip('copies PWA assets into renderer output and packaged app.asar', () => {
  const expectedAssets = [
    'out/renderer/manifest.webmanifest',
    'out/renderer/sw.js',
    'out/renderer/pwa/icon-180.png',
    'out/renderer/pwa/icon-192.png',
    'out/renderer/pwa/icon-512.png',
  ];

  for (const relativeAsset of expectedAssets) {
    const absoluteAsset = path.resolve(__dirname, '../../', relativeAsset);
    expect(fs.existsSync(absoluteAsset), `${relativeAsset} should exist`).toBe(true);
  }

  const manifestPath = path.resolve(__dirname, '../../out/renderer/manifest.webmanifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    display: string;
    icons: Array<{ sizes: string; src: string }>;
  };

  expect(manifest.display).toBe('standalone');
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', src: './pwa/icon-192.png' }),
      expect.objectContaining({ sizes: '512x512', src: './pwa/icon-512.png' }),
    ])
  );

  if (appAsarPath) {
    const asarEntries = getAsarEntries(appAsarPath);
    for (const relativeAsset of expectedAssets) {
      expect(asarEntries.has(toPosixPath(relativeAsset))).toBe(true);
    }
  }
});
