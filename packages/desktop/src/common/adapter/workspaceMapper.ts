/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile, IWorkspaceFlatFile, SkillFileNode } from './ipcBridge';

type RawFsEntry = { name: string; type: string };

/** Skill tree shape accepted from backend versions using either snake_case or camelCase fields. */
export type RawSkillFileNode = {
  name: string;
  relative_path?: string;
  relativePath?: string;
  is_dir?: boolean;
  isDir?: boolean;
  is_file?: boolean;
  isFile?: boolean;
  children?: RawSkillFileNode[];
};

export type RawWorkspaceFlatFile = { name: string; full_path: string; relative_path: string };

// ── Path helpers ───────────────────────────────────────────────────────

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

function stripTrailingSlash(p: string): string {
  return p.replace(/\/+$/, '');
}

/** Resolve either a skill directory or its entry-point file to the directory used as the WebUI workspace boundary. */
export function resolveWebSkillRoot(skillLocation: string): string {
  const normalized = stripTrailingSlash(normalizeSlashes(skillLocation));
  if (normalized.split('/').at(-1)?.toLowerCase() !== 'skill.md') return normalized;
  return normalized.slice(0, normalized.lastIndexOf('/')) || '/';
}

/** Build the absolute read target together with the root the backend uses to constrain filesystem access. */
export function resolveWebSkillFile(skillLocation: string, relativePath: string): { path: string; workspace: string } {
  const workspace = resolveWebSkillRoot(skillLocation);
  const normalizedRelativePath = normalizeSlashes(relativePath).replace(/^\/+/, '');
  return {
    path: `${stripTrailingSlash(workspace)}/${normalizedRelativePath}`,
    workspace,
  };
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

export function fromBackendWorkspaceFlatFiles(raw: RawWorkspaceFlatFile[]): IWorkspaceFlatFile[] {
  return raw.map((item) => ({
    name: item.name,
    fullPath: item.full_path,
    relativePath: item.relative_path,
  }));
}

function compareSkillFileNodes(a: SkillFileNode, b: SkillFileNode): number {
  // Match the native skill browser: pin SKILL.md, then show directories before files.
  const aPinned = a.relativePath.toLowerCase() === 'skill.md';
  const bPinned = b.relativePath.toLowerCase() === 'skill.md';
  if (aPinned !== bPinned) return aPinned ? -1 : 1;
  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

export function fromBackendSkillFileNodes(raw: RawSkillFileNode[], parentPath = ''): SkillFileNode[] {
  return raw
    .map((entry): SkillFileNode => {
      // Older responses may omit relative paths for nested children; rebuild them
      // from the traversal context so every node still has a stable renderer key.
      const rawRelativePath = entry.relative_path ?? entry.relativePath;
      const relativePath = normalizeSlashes(rawRelativePath ?? [parentPath, entry.name].filter(Boolean).join('/'))
        .replace(/^\.\//, '')
        .replace(/^\/+/, '');
      const isDirectory = entry.is_dir ?? entry.isDir ?? !(entry.is_file ?? entry.isFile ?? true);
      return {
        name: entry.name,
        relativePath,
        type: isDirectory ? 'directory' : 'file',
        ...(isDirectory
          ? { children: fromBackendSkillFileNodes(Array.isArray(entry.children) ? entry.children : [], relativePath) }
          : {}),
      };
    })
    .toSorted(compareSkillFileNodes);
}
