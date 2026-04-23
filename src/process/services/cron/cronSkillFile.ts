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
export function getCronSkillDir(job_id: string): string {
  return path.join(getCronSkillsDir(), job_id);
}

/**
 * Build SKILL.md content with YAML frontmatter and execution context.
 *
 * The generated content serves as the agent's instruction when a scheduled task fires.
 * It includes context about the task (name, schedule) and a clear directive so the agent
 * knows exactly what to do — even without prior conversation history.
 */
export function buildCronSkillContent(
  name: string,
  description: string,
  prompt: string,
  scheduleDescription?: string
): string {
  const sanitizedDesc = description.replace(/[\r\n]+/g, ' ').trim();

  const lines = [
    '---',
    `name: ${name}`,
    `description: ${sanitizedDesc}`,
    '---',
    '',
    `This is a scheduled task: **${name}**`,
  ];

  if (scheduleDescription) {
    lines.push(`Schedule: ${scheduleDescription}`);
  }

  lines.push(
    '',
    '## Instructions',
    '',
    'You are executing a scheduled task. Follow the instructions below directly.',
    'Do NOT ask clarifying questions — just execute the task and produce the result.',
    '',
    prompt
  );

  return lines.join('\n');
}

/**
 * Parse SKILL.md content, extracting frontmatter and prompt body.
 * Mirrors Claude Code's parseTaskFileContent().
 */
export function parseCronSkillContent(content: string): { name: string; description: string; prompt: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n+([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = match[1];
  let body = match[2];

  const nameMatch = frontmatter.match(/^name: (.+)$/m);
  const descMatch = frontmatter.match(/^description: (.+)$/m);

  if (!nameMatch?.[1] || !descMatch?.[1]) return null;

  // Extract the user's original prompt from the Instructions section
  const instructionsIdx = body.indexOf('## Instructions');
  if (instructionsIdx !== -1) {
    // Skip the heading and the two directive lines
    const afterHeading = body.substring(instructionsIdx);
    const promptLines = afterHeading.split('\n');
    // Find the first non-empty line after the directive lines
    let startIdx = 0;
    for (let i = 1; i < promptLines.length; i++) {
      const line = promptLines[i].trim();
      if (line === '') continue;
      if (line.startsWith('You are executing') || line.startsWith('Do NOT ask')) {
        continue;
      }
      startIdx = i;
      break;
    }
    body = promptLines.slice(startIdx).join('\n');
  }

  return {
    name: nameMatch[1].trim(),
    description: descMatch[1].trim(),
    prompt: body.trimEnd(),
  };
}

/**
 * Write a SKILL.md file for a cron job.
 * Creates directory {cronSkillsDir}/{job_id}/ and writes SKILL.md inside it.
 */
export async function writeCronSkillFile(
  job_id: string,
  name: string,
  description: string,
  prompt: string,
  scheduleDescription?: string
): Promise<string> {
  const dir = path.join(getCronSkillsDir(), job_id);
  const file_path = path.join(dir, 'SKILL.md');
  await fs.mkdir(dir, { recursive: true });
  const content = buildCronSkillContent(name, description, prompt, scheduleDescription);
  await fs.writeFile(file_path, content, 'utf-8');
  return file_path;
}

// Placeholder patterns that indicate the AI echoed the template instead of generating real content
const PLACEHOLDER_PATTERNS = [/^skill-name$/i, /^one-line description/i, /^your[- ]skill[- ]name/i, /^description of/i];

const PLACEHOLDER_BODY_PATTERNS = [
  /^\(Full SKILL\.md body/i,
  /^Full SKILL\.md body/i,
  /^\(clear instructions for executing this task/i,
  /^<Full instructions: output format, tone, sources to check/i,
];

/**
 * Check if a value looks like a template placeholder rather than real content.
 */
function isPlaceholder(value: string, patterns: RegExp[]): boolean {
  const trimmed = value.trim();
  return patterns.some((p) => p.test(trimmed));
}

/**
 * Validate that content is a well-formed SKILL.md with YAML frontmatter (name + description) and a non-empty body.
 * Rejects template placeholder content (e.g. "skill-name", "One-line description").
 * Returns a normalized result or null if invalid.
 */
export function validateSkillContent(content: string): { name: string; description: string; body: string } | null {
  if (!content || typeof content !== 'string') return null;

  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n+([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = match[1];
  const body = match[2]?.trim();

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

  if (!nameMatch?.[1]?.trim() || !descMatch?.[1]?.trim()) return null;
  if (!body) return null;

  const name = nameMatch[1].trim();
  const description = descMatch[1].trim();

  // Reject template placeholders
  if (isPlaceholder(name, PLACEHOLDER_PATTERNS)) return null;
  if (isPlaceholder(description, PLACEHOLDER_PATTERNS)) return null;
  if (isPlaceholder(body, PLACEHOLDER_BODY_PATTERNS)) return null;

  return { name, description, body };
}

/**
 * Write raw SKILL.md content directly (e.g. AI-generated skill from [SKILL_SUGGEST]).
 * Validates the content before writing. Throws if content is not a valid SKILL.md.
 */
export async function writeRawCronSkillFile(job_id: string, rawContent: string): Promise<string> {
  const validated = validateSkillContent(rawContent);
  if (!validated) {
    throw new Error('Invalid SKILL.md content: must have YAML frontmatter with name/description and a non-empty body');
  }

  const dir = path.join(getCronSkillsDir(), job_id);
  const file_path = path.join(dir, 'SKILL.md');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file_path, rawContent, 'utf-8');
  return file_path;
}

/**
 * Read raw SKILL.md content for a cron job.
 * Returns null if the file doesn't exist.
 */
export async function readCronSkillContent(job_id: string): Promise<string | null> {
  const file_path = path.join(getCronSkillsDir(), job_id, 'SKILL.md');
  try {
    return await fs.readFile(file_path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Check whether a per-task SKILL.md exists for the given cron job.
 */
export async function hasCronSkillFile(job_id: string): Promise<boolean> {
  const file_path = path.join(getCronSkillsDir(), job_id, 'SKILL.md');
  try {
    await fs.access(file_path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete the cron job's skill file directory.
 */
export async function deleteCronSkillFile(job_id: string): Promise<void> {
  const dir = path.join(getCronSkillsDir(), job_id);
  await fs.rm(dir, { recursive: true, force: true });
}
