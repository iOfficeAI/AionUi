/**
 * Resolve the aioncore binary path.
 *
 * Search order:
 *  1. Bundled with app (production)
 *  2. Project resources (development / E2E)
 *  3. System PATH
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const BINARY_NAME = 'aioncore';

function getBinaryName(): string {
  return process.platform === 'win32' ? `${BINARY_NAME}.exe` : BINARY_NAME;
}

/**
 * Resolve the aioncore binary path.
 * Returns the absolute path to the binary, or throws if not found.
 */
export function resolveBinaryPath(): string {
  const bundled = bundledPath();
  if (bundled) return bundled;

  const fromPath = resolveFromSystemPATH();
  if (fromPath) return fromPath;

  throw new Error(`Cannot find "${BINARY_NAME}" binary. Checked bundled location and system PATH.`);
}

/**
 * Check bundled binary in resources directory.
 * Layout: bundled-aioncore/{platform}-{arch}/aioncore[.exe]
 */
function bundledPath(): string | null {
  const runtimeKey = `${process.platform}-${process.arch}`;
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const roots = [resourcesPath, join(process.cwd(), 'resources')].filter((root): root is string => Boolean(root));

  for (const root of roots) {
    const candidate = join(root, 'bundled-aioncore', runtimeKey, getBinaryName());
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Try to find the binary on the system PATH.
 */
function resolveFromSystemPATH(): string | null {
  try {
    const cmd = process.platform === 'win32' ? `where ${BINARY_NAME}` : `which ${BINARY_NAME}`;
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result && existsSync(result)) return result;
  } catch {
    // not found in PATH
  }
  return null;
}
