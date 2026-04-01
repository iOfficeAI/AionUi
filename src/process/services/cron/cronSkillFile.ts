/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import { getCronSkillsDir } from '@process/utils/initStorage';

/**
 * Get the cron skill directory path for a given job ID.
 * The directory contains SKILL.md and can be symlinked into a workspace.
 */
export function getCronSkillDir(jobId: string): string {
  return path.join(getCronSkillsDir(), jobId);
}

/**
 * Build SKILL.md content with YAML frontmatter.
 * Mirrors Claude Code's buildTaskFileContent().
 */
export function buildCronSkillContent(name: string, description: string, prompt: string): string {
  const sanitizedDesc = description.replace(/[\r\n]+/g, ' ').trim();
  return `---\nname: ${name}\ndescription: ${sanitizedDesc}\n---\n\n${prompt}`;
}

/**
 * Parse SKILL.md content, extracting frontmatter and prompt body.
 * Mirrors Claude Code's parseTaskFileContent().
 */
export function parseCronSkillContent(content: string): { name: string; description: string; prompt: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n+([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = match[1];
  const prompt = match[2];

  const nameMatch = frontmatter.match(/^name: (.+)$/m);
  const descMatch = frontmatter.match(/^description: (.+)$/m);

  if (!nameMatch?.[1] || !descMatch?.[1]) return null;

  return {
    name: nameMatch[1].trim(),
    description: descMatch[1].trim(),
    prompt: prompt.trimEnd(),
  };
}

/**
 * Write a SKILL.md file for a cron job.
 * Creates directory {cronSkillsDir}/{jobId}/ and writes SKILL.md inside it.
 */
export async function writeCronSkillFile(
  jobId: string,
  name: string,
  description: string,
  prompt: string
): Promise<string> {
  const dir = path.join(getCronSkillsDir(), jobId);
  const filePath = path.join(dir, 'SKILL.md');
  await fs.mkdir(dir, { recursive: true });
  const content = buildCronSkillContent(name, description, prompt);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Read raw SKILL.md content for a cron job.
 * Returns null if the file doesn't exist.
 */
export async function readCronSkillContent(jobId: string): Promise<string | null> {
  const filePath = path.join(getCronSkillsDir(), jobId, 'SKILL.md');
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Delete the cron job's skill file directory.
 */
export async function deleteCronSkillFile(jobId: string): Promise<void> {
  const dir = path.join(getCronSkillsDir(), jobId);
  await fs.rm(dir, { recursive: true, force: true });
}
