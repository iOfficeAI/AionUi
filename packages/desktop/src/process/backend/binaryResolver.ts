/**
 * Resolve the packaged backend binary path.
 *
 * Search order:
 *  1. Bundled with app (production)
 *  2. System PATH
 *
 * Compatibility:
 *  - legacy binary/layout: aionui-backend, bundled-aionui-backend
 *  - upstream/current binary/layout: aioncore, bundled-aioncore
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const BINARY_NAMES = ['aionui-backend', 'aioncore'] as const;
const BUNDLED_DIR_NAMES = ['bundled-aionui-backend', 'bundled-aioncore'] as const;

function getBinaryFileName(binaryName: string): string {
  return process.platform === 'win32' ? `${binaryName}.exe` : binaryName;
}

/**
 * Resolve the backend binary path.
 * Returns the absolute path to the binary, or throws if not found.
 */
export function resolveBinaryPath(): string {
  const bundled = bundledPath();
  if (bundled) return bundled;

  const fromPath = resolveFromSystemPATH();
  if (fromPath) return fromPath;

  throw new Error(
    `Cannot find backend binary. Checked bundled locations (${BUNDLED_DIR_NAMES.join(', ')}) and system PATH names (${BINARY_NAMES.join(', ')}).`
  );
}

/**
 * Check bundled binary in resources directory.
 * Layout:
 *   - bundled-aionui-backend/{platform}-{arch}/aionui-backend[.exe]
 *   - bundled-aioncore/{platform}-{arch}/aioncore[.exe]
 */
function bundledPath(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (!resourcesPath) return null;

  const runtimeKey = `${process.platform}-${process.arch}`;
  for (const bundledDirName of BUNDLED_DIR_NAMES) {
    for (const binaryName of BINARY_NAMES) {
      const candidate = join(resourcesPath, bundledDirName, runtimeKey, getBinaryFileName(binaryName));
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Try to find the binary on the system PATH.
 */
function resolveFromSystemPATH(): string | null {
  const foundMatches: Array<{ binaryName: string; resolvedPath: string }> = [];
  for (const binaryName of BINARY_NAMES) {
    try {
      const cmd = process.platform === 'win32' ? `where ${binaryName}` : `which ${binaryName}`;
      const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
      if (result && existsSync(result)) {
        foundMatches.push({ binaryName, resolvedPath: result });
      }
    } catch {
      // try next name
    }
  }
  if (foundMatches.length > 1) {
    console.warn(
      `[backend-resolver] Multiple backend binaries detected in PATH: ${foundMatches
        .map((entry) => `${entry.binaryName}=${entry.resolvedPath}`)
        .join(', ')}. Preferring ${foundMatches[0].binaryName}.`
    );
  }
  return foundMatches[0]?.resolvedPath ?? null;
}
