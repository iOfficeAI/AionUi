import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

function listDirsRecursive(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(fullPath);
      results.push(...listDirsRecursive(fullPath));
    }
  }

  return results;
}

function findLatestResourcesDirUnderOut(): string | null {
  const outDir = path.resolve(__dirname, '../../out');
  if (!fs.existsSync(outDir)) return null;

  const allDirs = listDirsRecursive(outDir);
  const candidates = allDirs.filter((dir) => path.basename(dir) === 'resources');
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] || null;
}

function resolveResourcesDir(): string | null {
  const envResourcesDir = process.env.APP_RESOURCES_DIR;
  if (envResourcesDir) {
    const resolved = path.resolve(envResourcesDir);
    if (!fs.existsSync(resolved)) {
      throw new Error(`APP_RESOURCES_DIR does not exist: ${resolved}`);
    }
    return resolved;
  }

  const envAsar = process.env.APP_ASAR_PATH;
  if (envAsar) {
    const resolvedAsar = path.resolve(envAsar);
    if (!fs.existsSync(resolvedAsar)) {
      throw new Error(`APP_ASAR_PATH does not exist: ${resolvedAsar}`);
    }
    return path.dirname(resolvedAsar);
  }

  return findLatestResourcesDirUnderOut();
}

type BundledBunManifest = {
  platform: string;
  arch: string;
  version: string;
  generatedAt: string;
  sourceType: 'cache' | 'download' | 'none';
  cacheDir: string;
  cacheMeta?: {
    platform: string;
    arch: string;
    version: string;
    sourceType: 'download';
    source: Record<string, string>;
    updatedAt: string;
  };
  source: Record<string, unknown>;
  files: string[];
  skipped?: boolean;
  reason?: string;
};

describe('Packaged bundled bun resources integrity', () => {
  const resourcesDir = resolveResourcesDir();
  const runOrSkip = resourcesDir ? it : it.skip;

  runOrSkip('should include bundled-bun runtime files and valid manifest', () => {
    const bundledRoot = path.join(resourcesDir as string, 'bundled-bun');
    expect(fs.existsSync(bundledRoot)).toBe(true);

    const platformDirs = fs
      .readdirSync(bundledRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(bundledRoot, entry.name));

    expect(platformDirs.length).toBeGreaterThan(0);

    for (const platformDir of platformDirs) {
      const manifestPath = path.join(platformDir, 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BundledBunManifest;

      expect(manifest.platform).toBeTruthy();
      expect(manifest.arch).toBeTruthy();
      expect(manifest.version).toBeTruthy();
      expect(manifest.cacheDir).toBeTruthy();
      expect(Array.isArray(manifest.files)).toBe(true);
      expect(manifest.skipped).not.toBe(true);
      expect(['cache', 'download']).toContain(manifest.sourceType);

      if (manifest.sourceType === 'cache') {
        // Backward compatible: old packaged manifests may miss cacheMeta.
        if (manifest.cacheMeta) {
          expect(manifest.cacheMeta.sourceType).toBe('download');
        } else {
          expect((manifest.source as { dir?: string }).dir).toBeTruthy();
        }
      }

      const requiredFiles = manifest.platform === 'win32' ? ['bun.exe'] : ['bun'];
      for (const requiredFile of requiredFiles) {
        expect(manifest.files).toContain(requiredFile);
      }

      for (const file of manifest.files) {
        expect(fs.existsSync(path.join(platformDir, file))).toBe(true);
      }
    }
  });
});
