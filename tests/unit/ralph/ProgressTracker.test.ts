/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from '@jest/globals';
import { formatProgressEntry, parseProgress, appendProgress, generateProgressSummary } from '@/agent/ralph/ProgressTracker';
import type { RalphProgressEntry } from '@/agent/ralph/types';

const sampleEntry: RalphProgressEntry = {
  iteration: 1,
  storyId: 'US-001',
  storyTitle: 'Add user model',
  summary: 'Created User model with email and password fields.',
  filesChanged: ['src/models/User.ts', 'src/migrations/001_create_users.ts'],
  learnings: ['SQLite requires explicit foreign key pragma', 'bcrypt rounds should be 12 for production'],
  timestamp: new Date('2025-06-15T10:30:00Z').getTime(),
};

const sampleEntry2: RalphProgressEntry = {
  iteration: 2,
  storyId: 'US-002',
  storyTitle: 'Add registration endpoint',
  summary: 'Implemented POST /api/register with validation.',
  filesChanged: ['src/routes/auth.ts', 'src/validators/auth.ts'],
  learnings: ['Express 5 has built-in async error handling'],
  timestamp: new Date('2025-06-15T11:00:00Z').getTime(),
};

describe('ProgressTracker', () => {
  describe('formatProgressEntry', () => {
    it('should format an entry as markdown', () => {
      const result = formatProgressEntry(sampleEntry);

      expect(result).toContain('## Iteration 1: US-001 - Add user model');
      expect(result).toContain('**Timestamp:**');
      expect(result).toContain('### Summary');
      expect(result).toContain('Created User model with email and password fields.');
      expect(result).toContain('### Files Changed');
      expect(result).toContain('- src/models/User.ts');
      expect(result).toContain('- src/migrations/001_create_users.ts');
      expect(result).toContain('### Learnings');
      expect(result).toContain('- SQLite requires explicit foreign key pragma');
    });

    it('should handle entry with no files changed', () => {
      const entry: RalphProgressEntry = { ...sampleEntry, filesChanged: [] };
      const result = formatProgressEntry(entry);
      expect(result).not.toContain('### Files Changed');
    });

    it('should handle entry with no learnings', () => {
      const entry: RalphProgressEntry = { ...sampleEntry, learnings: [] };
      const result = formatProgressEntry(entry);
      expect(result).not.toContain('### Learnings');
    });

    it('should include ISO timestamp', () => {
      const result = formatProgressEntry(sampleEntry);
      expect(result).toContain('2025-06-15T10:30:00.000Z');
    });
  });

  describe('parseProgress', () => {
    it('should parse a single entry', () => {
      const formatted = formatProgressEntry(sampleEntry);
      const header = '# Ralph Progress Log\n\n';
      const entries = parseProgress(header + formatted);

      expect(entries).toHaveLength(1);
      expect(entries[0].iteration).toBe(1);
      expect(entries[0].storyId).toBe('US-001');
      expect(entries[0].storyTitle).toBe('Add user model');
      expect(entries[0].summary).toContain('Created User model');
      expect(entries[0].filesChanged).toContain('src/models/User.ts');
      expect(entries[0].learnings).toContain('SQLite requires explicit foreign key pragma');
    });

    it('should parse multiple entries separated by ---', () => {
      const content = appendProgress(appendProgress('', sampleEntry), sampleEntry2);
      const entries = parseProgress(content);

      expect(entries).toHaveLength(2);
      expect(entries[0].storyId).toBe('US-001');
      expect(entries[1].storyId).toBe('US-002');
    });

    it('should return empty array for empty content', () => {
      expect(parseProgress('')).toEqual([]);
      expect(parseProgress('   ')).toEqual([]);
    });

    it('should handle content with no valid entries', () => {
      expect(parseProgress('Some random text without headers')).toEqual([]);
    });

    it('should parse timestamp from entry', () => {
      const formatted = formatProgressEntry(sampleEntry);
      const entries = parseProgress(formatted);
      expect(entries).toHaveLength(1);
      expect(entries[0].timestamp).toBe(new Date('2025-06-15T10:30:00Z').getTime());
    });
  });

  describe('appendProgress', () => {
    it('should create initial progress with header when empty', () => {
      const result = appendProgress('', sampleEntry);
      expect(result).toContain('# Ralph Progress Log');
      expect(result).toContain('## Iteration 1: US-001');
    });

    it('should append with separator when content exists', () => {
      const initial = appendProgress('', sampleEntry);
      const result = appendProgress(initial, sampleEntry2);

      expect(result).toContain('---');
      expect(result).toContain('## Iteration 1: US-001');
      expect(result).toContain('## Iteration 2: US-002');
    });

    it('should handle whitespace-only existing content', () => {
      const result = appendProgress('   ', sampleEntry);
      expect(result).toContain('# Ralph Progress Log');
    });
  });

  describe('generateProgressSummary', () => {
    it('should generate summary for entries', () => {
      const summary = generateProgressSummary([sampleEntry, sampleEntry2]);

      expect(summary).toContain('Total iterations: 2');
      expect(summary).toContain('Stories worked on: 2');
      expect(summary).toContain('Last iteration: #2');
    });

    it('should handle empty entries', () => {
      expect(generateProgressSummary([])).toBe('No iterations completed yet.');
    });

    it('should count unique stories', () => {
      const duplicateEntry: RalphProgressEntry = {
        ...sampleEntry2,
        iteration: 3,
        storyId: 'US-001', // Same story as entry 1
        storyTitle: 'Add user model (retry)',
      };
      const summary = generateProgressSummary([sampleEntry, sampleEntry2, duplicateEntry]);
      expect(summary).toContain('Total iterations: 3');
      expect(summary).toContain('Stories worked on: 2');
    });
  });
});
