import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as readEnvironmentFile } from 'dotenv';
import { app } from 'electron';

type DesktopEnvironmentResult = {
  loadedPath?: string;
  error?: Error;
};

function loadEnvironmentFile(environmentPath: string): DesktopEnvironmentResult {
  const result = readEnvironmentFile({ path: environmentPath, quiet: true });
  if (result.error) return { error: result.error };
  return { loadedPath: environmentPath };
}

export function ensureLocalhostProxyBypass(): void {
  for (const name of ['NO_PROXY', 'no_proxy'] as const) {
    const entries = (process.env[name] ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!entries.includes('*')) entries.push('127.0.0.1', 'localhost');
    process.env[name] = [...new Set(entries)].join(',');
  }
}

export function loadDesktopEnvironment(): DesktopEnvironmentResult {
  const configuredPath = process.env.DOTENV_CONFIG_PATH;
  if (configuredPath) return loadEnvironmentFile(path.resolve(configuredPath));

  const appPath = app.getAppPath() === '.' ? process.cwd() : app.getAppPath();
  const candidates = [path.resolve(appPath, '.env')];
  if (app.isPackaged) {
    if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, '.env'));
  } else {
    candidates.push(path.resolve(process.cwd(), '.env'));
  }

  const environmentPath = candidates.find((candidate) => existsSync(candidate));
  return environmentPath ? loadEnvironmentFile(environmentPath) : {};
}

loadDesktopEnvironment();
ensureLocalhostProxyBypass();
