/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from './ipcBridge';

type RawFsEntry = { name: string; type: string };

export function absoluteToRelativePath(absolutePath: string, workspace: string): string {
  const ws = workspace.replace(/\/+$/, '');
  if (absolutePath === ws) return '.';
  if (absolutePath.startsWith(ws + '/')) {
    return absolutePath.slice(ws.length + 1) || '.';
  }
  return absolutePath;
}

export function fromBackendFsEntry(item: RawFsEntry, workspace: string, parentRelPath: string): IDirOrFile {
  const name = item.name || '';
  const isDir = item.type === 'directory';
  const relativePath = parentRelPath ? `${parentRelPath}/${name}` : name;
  return {
    name,
    fullPath: `${workspace}/${relativePath}`,
    relativePath,
    isDir,
    isFile: !isDir,
  };
}

export function fromBackendWorkspaceList(raw: RawFsEntry[], workspace: string, relPath: string): IDirOrFile[] {
  const base = relPath === '.' ? '' : relPath;
  const children = raw.map((item) => fromBackendFsEntry(item, workspace, base));

  if (relPath === '.') {
    const rootName = workspace.split('/').pop() || '';
    return [
      {
        name: rootName,
        fullPath: workspace,
        relativePath: '',
        isDir: true,
        isFile: false,
        children,
      },
    ];
  }

  return children;
}
