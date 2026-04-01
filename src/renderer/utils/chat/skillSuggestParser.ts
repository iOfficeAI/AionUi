/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SkillSuggestion {
  name: string;
  description: string;
  /** Full SKILL.md content (including frontmatter) */
  content: string;
}

/**
 * Validate that content is a well-formed SKILL.md:
 * must have YAML frontmatter with name + description, and a non-empty body.
 */
function isValidSkillContent(content: string): boolean {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n+([\s\S]*)$/);
  if (!match) return false;

  const frontmatter = match[1];
  const body = match[2]?.trim();

  const hasName = /^name:\s*.+/m.test(frontmatter);
  const hasDesc = /^description:\s*.+/m.test(frontmatter);

  return hasName && hasDesc && !!body;
}

/**
 * Parse [SKILL_SUGGEST]...[/SKILL_SUGGEST] blocks from AI message content.
 * Returns the first valid match or null. Validates the content field is a proper SKILL.md.
 */
export function parseSkillSuggest(text: string): SkillSuggestion | null {
  if (!text || typeof text !== 'string') return null;

  const match = text.match(/\[SKILL_SUGGEST\]\s*\n?([\s\S]*?)\[\/SKILL_SUGGEST\]/i);
  if (!match) return null;

  const body = match[1];

  const nameMatch = body.match(/^name:\s*(.+)/im);
  const descMatch = body.match(/^description:\s*(.+)/im);

  // Extract content: everything after "content:" line
  const contentMatch = body.match(/^content:\s*\n?([\s\S]*)/im);

  if (!nameMatch?.[1] || !contentMatch?.[1]) return null;

  const content = contentMatch[1].trim();

  // Validate the content is a well-formed SKILL.md before showing the card
  if (!isValidSkillContent(content)) return null;

  return {
    name: nameMatch[1].trim(),
    description: descMatch?.[1]?.trim() ?? nameMatch[1].trim(),
    content,
  };
}

/**
 * Strip [SKILL_SUGGEST] blocks from content for clean display.
 */
export function stripSkillSuggest(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\[SKILL_SUGGEST\][\s\S]*?\[\/SKILL_SUGGEST\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Check if content contains a [SKILL_SUGGEST] block.
 */
export function hasSkillSuggest(text: string): boolean {
  return /\[SKILL_SUGGEST\]/i.test(text);
}
