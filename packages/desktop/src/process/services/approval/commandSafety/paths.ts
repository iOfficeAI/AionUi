/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { toWorkspaceRelativePath } from '../../indexer/ignore';
import type { CommandSafetyHazard } from './types';

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

function isSecretPath(relativePath: string): boolean {
  const segments = relativePath.split('/');
  for (const segment of segments) {
    if (!segment) continue;
    if (SECRET_FILE_NAMES.has(segment)) return true;
    if (SECRET_FILE_SUFFIXES.some((suffix) => segment.endsWith(suffix))) return true;
    if (segment.startsWith('.') && (segment.includes('secret') || segment.includes('credential'))) {
      return true;
    }
  }
  return false;
}

function isDynamicPath(pathArg: string): boolean {
  if (/\$\{|\$\(|\$[A-Za-z_][A-Za-z0-9_]*/.test(pathArg)) return true;
  if (pathArg.includes('..')) return true;
  if (pathArg.includes('*') && pathArg.includes('/')) return true;
  return false;
}

export function isWorkspaceContainedPath(
  workspaceRoot: string,
  pathArg: string
): { contained: boolean; relative: string | null } {
  const trimmed = pathArg.trim();
  if (!trimmed || trimmed === '-' || trimmed.startsWith('-')) {
    return { contained: true, relative: null };
  }

  if (isDynamicPath(trimmed)) {
    return { contained: false, relative: null };
  }

  const relative = toWorkspaceRelativePath(workspaceRoot, trimmed);
  if (relative === null) {
    return { contained: false, relative: null };
  }

  return { contained: true, relative };
}

export function checkPathArgument(workspaceRoot: string, pathArg: string): CommandSafetyHazard | null {
  const trimmed = pathArg.trim();
  if (!trimmed || trimmed === '-' || trimmed.startsWith('-')) {
    return null;
  }

  if (isDynamicPath(trimmed)) {
    return { kind: 'dynamic_path', detail: `Dynamic or traversal path: ${trimmed}` };
  }

  const { contained, relative } = isWorkspaceContainedPath(workspaceRoot, trimmed);
  if (!contained) {
    return { kind: 'external_path', detail: `Path outside workspace: ${trimmed}` };
  }

  if (relative && isSecretPath(relative)) {
    return { kind: 'secret_path', detail: `Secret or credential path: ${trimmed}` };
  }

  return null;
}
