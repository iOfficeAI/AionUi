/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SkillFileNode } from '@/common/adapter/ipcBridge';
import fs from 'fs/promises';
import path from 'path';

const isWithin = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

const resolveSkillRoot = async (skillLocation: string): Promise<string> => {
  if (!path.isAbsolute(skillLocation)) {
    throw new Error('Skill location must be absolute');
  }

  const location = path.resolve(skillLocation);
  const root = path.basename(location).toLowerCase() === 'skill.md' ? path.dirname(location) : location;
  return fs.realpath(root);
};

const resolveExistingEntry = async (root: string, relativePath: string): Promise<string> => {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error('Skill file path must be relative');
  }

  const candidate = path.resolve(root, relativePath);
  if (!isWithin(root, candidate)) {
    throw new Error('Skill file path is outside the skill directory');
  }

  const realTarget = await fs.realpath(candidate);
  if (!isWithin(root, realTarget)) {
    throw new Error('Skill file path resolves outside the skill directory');
  }
  return realTarget;
};

const compareEntries = (a: SkillFileNode, b: SkillFileNode): number => {
  const aPinned = a.relativePath.toLowerCase() === 'skill.md';
  const bPinned = b.relativePath.toLowerCase() === 'skill.md';
  if (aPinned !== bPinned) return aPinned ? -1 : 1;
  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
};

const listDirectory = async (root: string, directory: string): Promise<SkillFileNode[]> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nodes: SkillFileNode[] = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        relativePath,
        type: 'directory',
        children: await listDirectory(root, absolutePath),
      });
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, relativePath, type: 'file' });
    }
  }

  return nodes.toSorted(compareEntries);
};

export const createSkillFileService = () => ({
  async list(skillLocation: string): Promise<SkillFileNode[]> {
    const root = await resolveSkillRoot(skillLocation);
    return listDirectory(root, root);
  },

  async read(skillLocation: string, relativePath: string): Promise<string> {
    const root = await resolveSkillRoot(skillLocation);
    const target = await resolveExistingEntry(root, relativePath);
    return fs.readFile(target, 'utf8');
  },
});
