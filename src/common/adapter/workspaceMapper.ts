/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from './ipcBridge';

type RawFsEntry = { name: string; type: string };

// ── Path helpers ───────────────────────────────────────────────────────

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

function stripTrailingSlash(p: string): string {
  return p.replace(/\/+$/, '');
}

// ── Frontend → Backend ─────────────────────────────────────────────────

export function absoluteToRelativePath(absolutePath: string, workspace: string): string {
  if (!absolutePath || !workspace) return absolutePath || '.';
  const abs = stripTrailingSlash(normalizeSlashes(absolutePath));
  const ws = stripTrailingSlash(normalizeSlashes(workspace));
  if (abs === ws) return '.';
  if (abs.startsWith(ws + '/')) {
    return abs.slice(ws.length + 1) || '.';
  }
  return absolutePath;
}

// ── Backend → Frontend ─────────────────────────────────────────────────

export function fromBackendFsEntry(item: RawFsEntry, workspace: string, parentRelPath: string): IDirOrFile {
  const ws = stripTrailingSlash(workspace);
  const name = item.name || '';
  const isDir = item.type === 'directory';
  const relativePath = parentRelPath ? `${parentRelPath}/${name}` : name;
  return {
    name,
    fullPath: `${ws}/${relativePath}`,
    relativePath,
    isDir,
    isFile: !isDir,
  };
}

export function fromBackendWorkspaceList(raw: RawFsEntry[], workspace: string, relPath: string): IDirOrFile[] {
  const ws = stripTrailingSlash(workspace);
  const base = relPath === '.' ? '' : relPath;
  const children = raw.map((item) => fromBackendFsEntry(item, ws, base));

  if (relPath === '.' || !relPath) {
    const rootName = ws.split('/').pop() || '';
    return [
      {
        name: rootName,
        fullPath: ws,
        relativePath: '',
        isDir: true,
        isFile: false,
        children,
      },
    ];
  }

  const dirName = relPath.split('/').pop() || '';
  return [
    {
      name: dirName,
      fullPath: `${ws}/${relPath}`,
      relativePath: relPath,
      isDir: true,
      isFile: false,
      children,
    },
  ];
}
