/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { existsSync } from 'fs';
import type { LoadedExtension, ExtSkill } from '../types';
import { isPathWithinDirectory } from '../sandbox/pathSafety';

type ResolvedSkill = {
  name: string;
  description: string;
  location: string;
};

export function resolveSkills(extensions: LoadedExtension[]): ResolvedSkill[] {
  const skills: ResolvedSkill[] = [];
  for (const ext of extensions) {
    const declaredSkills = ext.manifest.contributes.skills;
    if (!declaredSkills || declaredSkills.length === 0) continue;
    for (const skill of declaredSkills) {
      const resolved = convertSkill(skill, ext);
      if (resolved) {
        skills.push(resolved);
      }
    }
  }
  return skills;
}

function convertSkill(skill: ExtSkill, ext: LoadedExtension): ResolvedSkill | null {
  const absolutePath = path.resolve(ext.directory, skill.file);
  if (!isPathWithinDirectory(absolutePath, ext.directory)) {
    console.warn(`[Extensions] Skill file path traversal attempt: ${skill.file} in ${ext.manifest.name}`);
    return null;
  }
  if (!existsSync(absolutePath)) {
    console.warn(`[Extensions] Skill file not found: ${absolutePath} (extension: ${ext.manifest.name})`);
    return null;
  }
  return {
    name: skill.name,
    description: skill.description || `Skill from extension: ${ext.manifest.name}`,
    location: absolutePath,
  };
}
