/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { statSync } from 'node:fs';
import path from 'node:path';

const UNIX_PATH_DELIMITER = ':';

type UnixPathHydrationOptions = {
  currentPath: string;
  existingDirectories: string[];
};

function dedupePathEntries(entries: string[]): string[] {
  return [...new Set(entries.filter((entry) => entry.length > 0))];
}

function isExistingDirectory(directoryPath: string): boolean {
  try {
    return statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
}

function getUnixUserCliDirectories(home: string): string[] {
  if (!home) return [];

  return [
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.opencode', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.cargo', 'bin'),
    path.join(home, '.local', 'bin'),
    path.join(home, '.local', 'share', 'pnpm'),
  ];
}

export function buildUnixHydratedPath(options: UnixPathHydrationOptions): string {
  const currentEntries = options.currentPath.split(UNIX_PATH_DELIMITER);
  return dedupePathEntries([...options.existingDirectories, ...currentEntries]).join(UNIX_PATH_DELIMITER);
}

export function hydrateUnixProcessPath(env: NodeJS.ProcessEnv = process.env): string {
  const currentPath = env.PATH || '';
  const home = env.HOME || '';
  const existingDirectories = getUnixUserCliDirectories(home).filter(isExistingDirectory);
  const hydratedPath = buildUnixHydratedPath({ currentPath, existingDirectories });

  if (hydratedPath.length > 0) {
    env.PATH = hydratedPath;
  }

  return env.PATH || '';
}
