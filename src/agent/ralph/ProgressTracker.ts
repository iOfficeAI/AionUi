/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RalphProgressEntry } from './types';

const ENTRY_SEPARATOR = '\n---\n';
const SECTION_HEADER_REGEX = /^## Iteration (\d+)/;

/**
 * Format a single progress entry as a markdown string.
 */
export function formatProgressEntry(entry: RalphProgressEntry): string {
  const lines: string[] = [];

  lines.push(`## Iteration ${entry.iteration}: ${entry.storyId} - ${entry.storyTitle}`);
  lines.push(`**Timestamp:** ${new Date(entry.timestamp).toISOString()}`);
  lines.push('');
  lines.push(`### Summary`);
  lines.push(entry.summary);
  lines.push('');

  if (entry.filesChanged.length > 0) {
    lines.push('### Files Changed');
    for (const file of entry.filesChanged) {
      lines.push(`- ${file}`);
    }
    lines.push('');
  }

  if (entry.learnings.length > 0) {
    lines.push('### Learnings');
    for (const learning of entry.learnings) {
      lines.push(`- ${learning}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Parse a progress.txt content string into individual entries.
 */
export function parseProgress(content: string): RalphProgressEntry[] {
  if (!content || content.trim() === '') {
    return [];
  }

  const entries: RalphProgressEntry[] = [];
  const sections = content.split(ENTRY_SEPARATOR).filter((s) => s.trim() !== '');

  for (const section of sections) {
    const entry = parseSection(section.trim());
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Parse a single section of progress text into a RalphProgressEntry.
 */
function parseSection(section: string): RalphProgressEntry | null {
  const lines = section.split('\n');

  // Parse header: "## Iteration N: US-XXX - Title"
  // Scan all lines to find the header (may not be line 0 if preceded by a top-level heading)
  let headerMatch: RegExpMatchArray | null = null;
  let headerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^## Iteration (\d+): (\S+) - (.+)$/);
    if (match) {
      headerMatch = match;
      headerLineIdx = i;
      break;
    }
  }
  if (!headerMatch || headerLineIdx === -1) {
    return null;
  }
  // Re-slice lines from the header onward for consistent sub-section parsing
  const contentLines = lines.slice(headerLineIdx);

  const iteration = parseInt(headerMatch[1], 10);
  const storyId = headerMatch[2];
  const storyTitle = headerMatch[3];

  // Parse timestamp
  let timestamp = Date.now();
  const timestampLine = contentLines.find((l) => l.startsWith('**Timestamp:**'));
  if (timestampLine) {
    const tsMatch = timestampLine.match(/\*\*Timestamp:\*\*\s*(.+)$/);
    if (tsMatch) {
      const parsed = Date.parse(tsMatch[1]);
      if (!isNaN(parsed)) {
        timestamp = parsed;
      }
    }
  }

  // Parse summary (content between "### Summary" and next "###" or end)
  const summary = extractSection(contentLines, '### Summary');

  // Parse files changed
  const filesChanged = extractListItems(contentLines, '### Files Changed');

  // Parse learnings
  const learnings = extractListItems(contentLines, '### Learnings');

  return {
    iteration,
    storyId,
    storyTitle,
    summary,
    filesChanged,
    learnings,
    timestamp,
  };
}

/**
 * Extract text content between a section header and the next header.
 */
function extractSection(lines: string[], header: string): string {
  const startIdx = lines.findIndex((l) => l.trim() === header);
  if (startIdx === -1) return '';

  const contentLines: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('###') || SECTION_HEADER_REGEX.test(lines[i])) {
      break;
    }
    contentLines.push(lines[i]);
  }

  return contentLines.join('\n').trim();
}

/**
 * Extract list items (lines starting with "- ") from a section.
 */
function extractListItems(lines: string[], header: string): string[] {
  const startIdx = lines.findIndex((l) => l.trim() === header);
  if (startIdx === -1) return [];

  const items: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('###') || SECTION_HEADER_REGEX.test(lines[i])) {
      break;
    }
    if (line.startsWith('- ')) {
      items.push(line.slice(2));
    }
  }

  return items;
}

/**
 * Append a new entry to existing progress content.
 * Returns the updated full progress content.
 */
export function appendProgress(existingContent: string, entry: RalphProgressEntry): string {
  const formatted = formatProgressEntry(entry);

  if (!existingContent || existingContent.trim() === '') {
    return `# Ralph Progress Log\n\n${formatted}`;
  }

  return `${existingContent.trimEnd()}${ENTRY_SEPARATOR}${formatted}`;
}

/**
 * Generate a progress summary string for display.
 */
export function generateProgressSummary(entries: RalphProgressEntry[]): string {
  if (entries.length === 0) {
    return 'No iterations completed yet.';
  }

  const lines: string[] = [];
  lines.push(`Total iterations: ${entries.length}`);

  const completedStories = new Set(entries.filter((e) => e.summary).map((e) => e.storyId));
  lines.push(`Stories worked on: ${completedStories.size}`);

  const lastEntry = entries[entries.length - 1];
  lines.push(`Last iteration: #${lastEntry.iteration} (${lastEntry.storyId} - ${lastEntry.storyTitle})`);

  return lines.join('\n');
}
