/**
 * Resolve the packaged backend binary path.
 *
 * Search order:
 *  0. Explicit environment override
 *  1. Bundled with app (production)
 *  2. System PATH
 *
 * Runtime/backend naming uses aioncore exclusively.
 */

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const BINARY_NAMES = ['aioncore'] as const;
const BUNDLED_DIR_NAMES = ['bundled-aioncore'] as const;
const OVERRIDE_ENV_NAMES = ['AIONCORE_BIN', 'AIONCORE_BINARY'] as const;
const DEV_SIBLING_AIONCORE_PATHS = [
  resolve(process.cwd(), '../AionCore-main/target/debug', getBinaryFileName('aioncore')),
  resolve(process.cwd(), '../AionCore/target/debug', getBinaryFileName('aioncore')),
] as const;

function getBinaryFileName(binaryName: string): string {
  return process.platform === 'win32' ? `${binaryName}.exe` : binaryName;
}

/**
 * Resolve the backend binary path.
 * Returns the absolute path to the binary, or throws if not found.
 */
export function resolveBinaryPath(): string {
  const explicit = explicitOverridePath();
  if (explicit) return explicit;

  const devSibling = resolveDevSiblingAioncore();
  if (devSibling) return devSibling;

  const bundled = bundledPath();
  if (bundled) return bundled;

  const fromPath = resolveFromSystemPATH();
  if (fromPath) return fromPath;

  throw new Error(
    `Cannot find backend binary. Checked env overrides (${OVERRIDE_ENV_NAMES.join(', ')}), bundled locations (${BUNDLED_DIR_NAMES.join(', ')}), local dev sibling AionCore targets, and system PATH names (${BINARY_NAMES.join(', ')}).`
  );
}

function explicitOverridePath(): string | null {
  for (const envName of OVERRIDE_ENV_NAMES) {
    const candidate = process.env[envName]?.trim();
    if (!candidate) continue;
    if (!existsSync(candidate)) {
      throw new Error(`[backend-resolver] ${envName} is set but file does not exist: ${candidate}`);
    }
    return candidate;
  }
  return null;
}

/**
 * Check bundled binary in resources directory.
 * Layout:
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

function resolveDevSiblingAioncore(): string | null {
  const isElectronDev = Boolean(process.versions?.electron) && process.env.NODE_ENV !== 'production';
  if (!isElectronDev) return null;

  for (const candidate of DEV_SIBLING_AIONCORE_PATHS) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Try to find the binary on the system PATH.
 */
function resolveFromSystemPATH(): string | null {
  for (const binaryName of BINARY_NAMES) {
    try {
      const cmd = process.platform === 'win32' ? `where ${binaryName}` : `which ${binaryName}`;
      const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
      if (result && existsSync(result)) return result;
    } catch {
      // try next name
    }
  }
  return null;
}
