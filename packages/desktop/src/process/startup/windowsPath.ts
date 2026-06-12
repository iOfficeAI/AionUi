/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process';

const USER_PATH_REGISTRY_KEY = 'HKCU\\Environment';
const MACHINE_PATH_REGISTRY_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';

type WindowsPathHydrationOptions = {
  currentPath: string;
  userRegistryOutput: string;
  machineRegistryOutput: string;
  env: NodeJS.ProcessEnv;
};

type ExecFileSyncLike = typeof execFileSync;

function buildEnvLookup(env: NodeJS.ProcessEnv): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      lookup.set(key.toUpperCase(), value);
    }
  }
  return lookup;
}

function expandWindowsEnvVars(value: string, env: NodeJS.ProcessEnv): string {
  const lookup = buildEnvLookup(env);
  return value.replace(/%([^%]+)%/g, (match, name: string) => lookup.get(name.toUpperCase()) ?? match);
}

function splitWindowsPathEntries(value: string): string[] {
  return value
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function dedupeWindowsPathEntries(entries: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const entry of entries) {
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

export function parseWindowsRegistryPathOutput(output: string, env: NodeJS.ProcessEnv): string[] {
  const pathLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^Path\s+REG_\w+\s+/i.test(line));

  if (!pathLine) return [];

  const value = pathLine.replace(/^Path\s+REG_\w+\s+/i, '');
  return dedupeWindowsPathEntries(splitWindowsPathEntries(expandWindowsEnvVars(value, env)));
}

export function buildWindowsHydratedPath(options: WindowsPathHydrationOptions): string {
  const machinePaths = parseWindowsRegistryPathOutput(options.machineRegistryOutput, options.env);
  const userPaths = parseWindowsRegistryPathOutput(options.userRegistryOutput, options.env);
  const currentPaths = splitWindowsPathEntries(options.currentPath);

  return dedupeWindowsPathEntries([...machinePaths, ...userPaths, ...currentPaths]).join(';');
}

function readWindowsRegistryPath(registryKey: string, execFileSyncImpl: ExecFileSyncLike = execFileSync): string {
  try {
    return execFileSyncImpl('reg', ['query', registryKey, '/v', 'Path'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
  } catch {
    return '';
  }
}

function getCurrentWindowsPath(env: NodeJS.ProcessEnv): string {
  return env.PATH || env.Path || '';
}

function setCurrentWindowsPath(env: NodeJS.ProcessEnv, value: string): void {
  env.PATH = value;
  env.Path = value;
}

export function hydrateWindowsProcessPath(env: NodeJS.ProcessEnv = process.env): string {
  const hydratedPath = buildWindowsHydratedPath({
    currentPath: getCurrentWindowsPath(env),
    userRegistryOutput: readWindowsRegistryPath(USER_PATH_REGISTRY_KEY),
    machineRegistryOutput: readWindowsRegistryPath(MACHINE_PATH_REGISTRY_KEY),
    env,
  });

  if (hydratedPath.length > 0) {
    setCurrentWindowsPath(env, hydratedPath);
  }

  return getCurrentWindowsPath(env);
}
