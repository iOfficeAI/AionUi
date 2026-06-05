/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { CHISL_INDEX_DB_FILENAME } from './paths';

const IGNORE_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '.hg',
  '.svn',
  'dist',
  'out',
  'build',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'coverage',
  '.vite',
  '.parcel-cache',
  '__pycache__',
  '.pytest_cache',
  'target',
]);

const IGNORE_FILE_NAMES = new Set(['.DS_Store', 'Thumbs.db']);

const SECRET_FILE_NAMES = new Set([
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.test',
  'credentials.json',
  'secrets.json',
  'id_rsa',
  'id_ed25519',
]);

const SECRET_FILE_SUFFIXES = ['.pem', '.key', '.p12', '.pfx'];

export type IndexIgnoreOptions = {
  /** Absolute path to the Chisl index database (ignored when under workspace). */
  indexDbPath?: string;
  extraIgnoredDirNames?: readonly string[];
  extraIgnoredFileNames?: readonly string[];
};

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function pathHasIgnoredSegment(relativePath: string, ignoredDirNames: Set<string>): boolean {
  const segments = normalizeRelativePath(relativePath).split('/');
  return segments.some((segment) => ignoredDirNames.has(segment));
}

function isSecretFileName(name: string): boolean {
  if (SECRET_FILE_NAMES.has(name)) return true;
  return SECRET_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * Returns true when a workspace-relative or absolute path should be excluded from indexing.
 */
export function shouldIgnoreIndexPath(
  relativePath: string,
  absolutePath: string,
  options: IndexIgnoreOptions = {}
): boolean {
  const normalizedRelative = normalizeRelativePath(relativePath);
  if (!normalizedRelative || normalizedRelative === '.') return false;

  const ignoredDirs = new Set(IGNORE_DIR_NAMES);
  for (const name of options.extraIgnoredDirNames ?? []) {
    ignoredDirs.add(name);
  }

  if (pathHasIgnoredSegment(normalizedRelative, ignoredDirs)) {
    return true;
  }

  const baseName = path.basename(absolutePath);
  const ignoredFiles = new Set(IGNORE_FILE_NAMES);
  for (const name of options.extraIgnoredFileNames ?? []) {
    ignoredFiles.add(name);
  }
  if (ignoredFiles.has(baseName)) {
    return true;
  }

  if (baseName.startsWith('.') && isSecretFileName(baseName)) {
    return true;
  }
  if (isSecretFileName(baseName)) {
    return true;
  }

  if (baseName === CHISL_INDEX_DB_FILENAME) {
    return true;
  }

  const indexDbPath = options.indexDbPath;
  if (indexDbPath) {
    const resolvedIndexDb = path.resolve(indexDbPath);
    const resolvedAbsolute = path.resolve(absolutePath);
    if (resolvedAbsolute === resolvedIndexDb) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves a path relative to the workspace root, rejecting paths that escape the root.
 */
export function toWorkspaceRelativePath(workspaceRoot: string, absoluteOrRelativePath: string): string | null {
  const root = path.resolve(workspaceRoot);
  const resolved = path.isAbsolute(absoluteOrRelativePath)
    ? path.resolve(absoluteOrRelativePath)
    : path.resolve(root, absoluteOrRelativePath);

  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return normalizeRelativePath(relative);
}
