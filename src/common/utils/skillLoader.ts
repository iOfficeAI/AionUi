/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Loads a skill definition from a markdown file in the skill directory.
 * @param skillName The name of the skill file (e.g., 'claude-skill', 'codex-skill')
 * @returns The content of the skill file, or undefined if not found
 */
export async function loadSkillContent(skillName: string): Promise<string | undefined> {
  // Use a hardcoded path relative to the app root or handle it dynamically
  // Assuming the process cwd is the app root
  const skillPath = path.join(process.cwd(), 'skill', `${skillName}.md`);
  try {
    const content = await fs.readFile(skillPath, 'utf-8');
    return content;
  } catch (error) {
    console.warn(`Failed to load skill content for ${skillName} at ${skillPath}:`, error);
    return undefined;
  }
}
