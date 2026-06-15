/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const USER_PATH_REGISTRY_KEY = 'HKCU\\Environment';
const MACHINE_PATH_REGISTRY_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';

type WindowsPathHydrationOptions = {
  currentPath: string;
  userRegistryOutput: string;
  machineRegistryOutput: string;
  env: NodeJS.ProcessEnv;
  profileContents?: string[];
  fallbackPathEntries?: string[];
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

function expandShellEnvVars(value: string, env: NodeJS.ProcessEnv): string {
  const lookup = buildEnvLookup(env);
  return expandWindowsEnvVars(value, env)
    .replace(/\$(?:env:)?([A-Za-z_][A-Za-z0-9_]*)/g, (match, name: string) => lookup.get(name.toUpperCase()) ?? match)
    .replace(
      /\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (match, name: string) => lookup.get(name.toUpperCase()) ?? match
    );
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

function splitProfilePathList(value: string): string[] {
  const entries: string[] = [];
  let current = '';

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1] ?? '';
    const next = value[index + 1] ?? '';
    const drivePrefixStart = value[index - 2] ?? '';
    const isWindowsDriveSeparator =
      char === ':' &&
      /^[A-Za-z]$/.test(previous) &&
      (next === '\\' || next === '/') &&
      (index === 1 || drivePrefixStart === ';' || drivePrefixStart === ':' || /\s/.test(drivePrefixStart));

    if ((char === ';' || char === ':') && !isWindowsDriveSeparator) {
      entries.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  entries.push(current);
  return entries;
}

function normalizeProfilePathEntry(entry: string, env: NodeJS.ProcessEnv): string | null {
  const trimmed = entry
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();

  if (!trimmed || /^\$env:PATH$/i.test(trimmed) || /^\$PATH$/i.test(trimmed) || /^%PATH%$/i.test(trimmed)) {
    return null;
  }

  let expanded = expandShellEnvVars(trimmed, env);
  const home = env.USERPROFILE || env.HOME;

  if (home && (expanded === '~' || expanded.startsWith('~/') || expanded.startsWith('~\\'))) {
    expanded = path.win32.join(home, expanded.slice(2));
  }

  const msysDrivePath = expanded.match(/^\/([A-Za-z])\/(.+)$/);
  if (msysDrivePath) {
    expanded = `${msysDrivePath[1].toUpperCase()}:\\${msysDrivePath[2].replace(/\//g, '\\')}`;
  } else if (/^[A-Za-z]:[\\/]/.test(expanded)) {
    expanded = expanded.replace(/\//g, '\\');
  }

  return /^[A-Za-z]:\\/.test(expanded) ? expanded.replace(/[\\/]+$/, '') : null;
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

export function parseWindowsProfilePathEntries(content: string, env: NodeJS.ProcessEnv): string[] {
  const entries: string[] = [];
  const stringLiteralPattern = /(['"])([^'"\r\n]+)\1/g;

  for (const line of content.split(/\r?\n/)) {
    if (!/\bPATH\b|\$env:Path|%PATH%|\$PATH/i.test(line)) continue;

    let match: RegExpExecArray | null;
    while ((match = stringLiteralPattern.exec(line)) !== null) {
      const expandedLiteral = expandShellEnvVars(match[2].replace(/\$env:PATH|%PATH%|\$PATH/gi, ''), env);
      for (const part of splitProfilePathList(expandedLiteral)) {
        const normalized = normalizeProfilePathEntry(part, env);
        if (normalized) entries.push(normalized);
      }
    }
  }

  return dedupeWindowsPathEntries(entries);
}

export function buildWindowsHydratedPath(options: WindowsPathHydrationOptions): string {
  const machinePaths = parseWindowsRegistryPathOutput(options.machineRegistryOutput, options.env);
  const userPaths = parseWindowsRegistryPathOutput(options.userRegistryOutput, options.env);
  const profilePaths = dedupeWindowsPathEntries(
    (options.profileContents ?? []).flatMap((content) => parseWindowsProfilePathEntries(content, options.env))
  );
  const fallbackPaths = dedupeWindowsPathEntries(options.fallbackPathEntries ?? []);
  const currentPaths = splitWindowsPathEntries(options.currentPath);

  return dedupeWindowsPathEntries([
    ...machinePaths,
    ...userPaths,
    ...profilePaths,
    ...fallbackPaths,
    ...currentPaths,
  ]).join(';');
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

function isExistingDirectory(directoryPath: string): boolean {
  try {
    return statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
}

function readTextFileIfPresent(filePath: string): string {
  try {
    if (!existsSync(filePath)) return '';
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function getWindowsProfileFilePaths(env: NodeJS.ProcessEnv): string[] {
  const userProfile = env.USERPROFILE || env.HOME;
  if (!userProfile) return [];

  const documents = path.win32.join(userProfile, 'Documents');
  return [
    path.win32.join(documents, 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
    path.win32.join(documents, 'PowerShell', 'profile.ps1'),
    path.win32.join(documents, 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
    path.win32.join(documents, 'WindowsPowerShell', 'profile.ps1'),
    path.win32.join(userProfile, '.bashrc'),
    path.win32.join(userProfile, '.bash_profile'),
    path.win32.join(userProfile, '.profile'),
    path.win32.join(userProfile, '.zshrc'),
  ];
}

function readWindowsProfileContents(env: NodeJS.ProcessEnv): string[] {
  return getWindowsProfileFilePaths(env)
    .map(readTextFileIfPresent)
    .filter((content) => content.length > 0);
}

function getExistingWindowsFallbackPathEntries(env: NodeJS.ProcessEnv): string[] {
  const userProfile = env.USERPROFILE || env.HOME || '';
  const appData = env.APPDATA || (userProfile ? path.win32.join(userProfile, 'AppData', 'Roaming') : '');
  const localAppData = env.LOCALAPPDATA || (userProfile ? path.win32.join(userProfile, 'AppData', 'Local') : '');
  const scoop = env.SCOOP || (userProfile ? path.win32.join(userProfile, 'scoop') : '');
  const scoopGlobal = env.SCOOP_GLOBAL || 'C:\\ProgramData\\scoop';

  const candidates = [
    scoop && path.win32.join(scoop, 'shims'),
    scoopGlobal && path.win32.join(scoopGlobal, 'shims'),
    'C:\\Scoop\\shims',
    'D:\\Scoop\\shims',
    appData && path.win32.join(appData, 'npm'),
    localAppData && path.win32.join(localAppData, 'Microsoft', 'WindowsApps'),
    userProfile && path.win32.join(userProfile, '.bun', 'bin'),
    userProfile && path.win32.join(userProfile, '.cargo', 'bin'),
    userProfile && path.win32.join(userProfile, '.local', 'bin'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return dedupeWindowsPathEntries(candidates.filter(isExistingDirectory));
}

export function hydrateWindowsProcessPath(env: NodeJS.ProcessEnv = process.env): string {
  const hydratedPath = buildWindowsHydratedPath({
    currentPath: getCurrentWindowsPath(env),
    userRegistryOutput: readWindowsRegistryPath(USER_PATH_REGISTRY_KEY),
    machineRegistryOutput: readWindowsRegistryPath(MACHINE_PATH_REGISTRY_KEY),
    profileContents: readWindowsProfileContents(env),
    fallbackPathEntries: getExistingWindowsFallbackPathEntries(env),
    env,
  });

  if (hydratedPath.length > 0) {
    setCurrentWindowsPath(env, hydratedPath);
  }

  return getCurrentWindowsPath(env);
}
