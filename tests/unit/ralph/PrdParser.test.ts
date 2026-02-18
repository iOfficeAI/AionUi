/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from '@jest/globals';
import { parsePrd, validatePrd, getNextStory, markStoryComplete, isAllComplete, getCompletionStats, createEmptyPrd, addUserStory, PrdValidationError } from '@/agent/ralph/PrdParser';
import type { RalphPrd } from '@/agent/ralph/types';

const validPrd: RalphPrd = {
  project: 'test-project',
  branchName: 'ralph/test-feature',
  description: 'Test feature description',
  userStories: [
    {
      id: 'US-001',
      title: 'First story',
      description: 'As a user, I want X so that Y',
      acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
      priority: 1,
      passes: false,
    },
    {
      id: 'US-002',
      title: 'Second story',
      description: 'As a user, I want A so that B',
      acceptanceCriteria: ['Criterion A'],
      priority: 2,
      passes: false,
    },
    {
      id: 'US-003',
      title: 'Third story',
      description: 'As a user, I want C so that D',
      acceptanceCriteria: ['Criterion C', 'Criterion D'],
      priority: 3,
      passes: true,
    },
  ],
};

describe('PrdParser', () => {
  describe('validatePrd', () => {
    it('should return no errors for a valid PRD', () => {
      expect(validatePrd(validPrd)).toEqual([]);
    });

    it('should reject null input', () => {
      const errors = validatePrd(null);
      expect(errors).toContain('PRD must be a non-null object');
    });

    it('should reject non-object input', () => {
      const errors = validatePrd('string');
      expect(errors).toContain('PRD must be a non-null object');
    });

    it('should require project field', () => {
      const errors = validatePrd({ ...validPrd, project: '' });
      expect(errors).toContain('project must be a non-empty string');
    });

    it('should require branchName field', () => {
      const errors = validatePrd({ ...validPrd, branchName: '' });
      expect(errors).toContain('branchName must be a non-empty string');
    });

    it('should require description field', () => {
      const errors = validatePrd({ ...validPrd, description: '' });
      expect(errors).toContain('description must be a non-empty string');
    });

    it('should require userStories to be an array', () => {
      const errors = validatePrd({ ...validPrd, userStories: 'not-an-array' });
      expect(errors).toContain('userStories must be an array');
    });

    it('should require at least one user story', () => {
      const errors = validatePrd({ ...validPrd, userStories: [] });
      expect(errors).toContain('userStories must contain at least one story');
    });

    it('should detect duplicate story IDs', () => {
      const prd = {
        ...validPrd,
        userStories: [{ ...validPrd.userStories[0] }, { ...validPrd.userStories[1], id: 'US-001', priority: 2 }],
      };
      const errors = validatePrd(prd);
      expect(errors.some((e) => e.includes('duplicated'))).toBe(true);
    });

    it('should detect duplicate priorities', () => {
      const prd = {
        ...validPrd,
        userStories: [{ ...validPrd.userStories[0] }, { ...validPrd.userStories[1], priority: 1 }],
      };
      const errors = validatePrd(prd);
      expect(errors.some((e) => e.includes('priority 1 is duplicated'))).toBe(true);
    });

    it('should require story id to be a non-empty string', () => {
      const prd = {
        ...validPrd,
        userStories: [{ ...validPrd.userStories[0], id: '' }],
      };
      const errors = validatePrd(prd);
      expect(errors.some((e) => e.includes('.id must be a non-empty string'))).toBe(true);
    });

    it('should require story title to be a non-empty string', () => {
      const prd = {
        ...validPrd,
        userStories: [{ ...validPrd.userStories[0], title: '' }],
      };
      const errors = validatePrd(prd);
      expect(errors.some((e) => e.includes('.title must be a non-empty string'))).toBe(true);
    });

    it('should require story description to be a non-empty string', () => {
      const prd = {
        ...validPrd,
        userStories: [{ ...validPrd.userStories[0], description: '' }],
      };
      const errors = validatePrd(prd);
      expect(errors.some((e) => e.includes('.description must be a non-empty string'))).toBe(true);
    });

    it('should require acceptanceCriteria to be a non-empty array', () => {
      const prd = {
        ...validPrd,
        userStories: [{ ...validPrd.userStories[0], acceptanceCriteria: [] as string[] }],
      };
      const errors = validatePrd(prd);
      expect(errors.some((e) => e.includes('.acceptanceCriteria must be a non-empty array'))).toBe(true);
    });

    it('should require acceptanceCriteria items to be strings', () => {
      const prd = {
        ...validPrd,
        userStories: [{ ...validPrd.userStories[0], acceptanceCriteria: [123 as any] }],
      };
      const errors = validatePrd(prd);
      expect(errors.some((e) => e.includes('acceptanceCriteria[0] must be a string'))).toBe(true);
    });

    it('should require priority to be a positive integer', () => {
      const prd = {
        ...validPrd,
        userStories: [{ ...validPrd.userStories[0], priority: 0 }],
      };
      const errors = validatePrd(prd);
      expect(errors.some((e) => e.includes('priority must be a positive integer'))).toBe(true);
    });

    it('should require passes to be a boolean', () => {
      const prd = {
        ...validPrd,
        userStories: [{ ...validPrd.userStories[0], passes: 'yes' as any }],
      };
      const errors = validatePrd(prd);
      expect(errors.some((e) => e.includes('.passes must be a boolean'))).toBe(true);
    });

    it('should reject non-integer priority', () => {
      const prd = {
        ...validPrd,
        userStories: [{ ...validPrd.userStories[0], priority: 1.5 }],
      };
      const errors = validatePrd(prd);
      expect(errors.some((e) => e.includes('priority must be a positive integer'))).toBe(true);
    });
  });

  describe('parsePrd', () => {
    it('should parse valid JSON into a PRD', () => {
      const result = parsePrd(JSON.stringify(validPrd));
      expect(result.project).toBe('test-project');
      expect(result.userStories).toHaveLength(3);
    });

    it('should throw PrdValidationError for invalid JSON', () => {
      expect(() => parsePrd('not-json')).toThrow(PrdValidationError);
    });

    it('should throw PrdValidationError for invalid PRD structure', () => {
      expect(() => parsePrd(JSON.stringify({ project: '' }))).toThrow(PrdValidationError);
    });

    it('should include validation errors in the error', () => {
      try {
        parsePrd(JSON.stringify({ project: '' }));
        fail('Expected PrdValidationError');
      } catch (e) {
        expect(e).toBeInstanceOf(PrdValidationError);
        expect((e as PrdValidationError).errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getNextStory', () => {
    it('should return the highest priority incomplete story', () => {
      const next = getNextStory(validPrd);
      expect(next).not.toBeNull();
      expect(next!.id).toBe('US-001');
      expect(next!.priority).toBe(1);
    });

    it('should skip completed stories', () => {
      const prd: RalphPrd = {
        ...validPrd,
        userStories: [{ ...validPrd.userStories[0], passes: true }, { ...validPrd.userStories[1] }, { ...validPrd.userStories[2] }],
      };
      const next = getNextStory(prd);
      expect(next!.id).toBe('US-002');
    });

    it('should return null when all stories are complete', () => {
      const prd: RalphPrd = {
        ...validPrd,
        userStories: validPrd.userStories.map((s) => ({ ...s, passes: true })),
      };
      expect(getNextStory(prd)).toBeNull();
    });

    it('should respect priority ordering', () => {
      const prd: RalphPrd = {
        ...validPrd,
        userStories: [
          { ...validPrd.userStories[1], priority: 5, passes: false },
          { ...validPrd.userStories[0], priority: 3, passes: false },
        ],
      };
      const next = getNextStory(prd);
      expect(next!.priority).toBe(3);
    });
  });

  describe('markStoryComplete', () => {
    it('should mark a story as complete', () => {
      const result = markStoryComplete(validPrd, 'US-001');
      expect(result.userStories.find((s) => s.id === 'US-001')!.passes).toBe(true);
    });

    it('should not mutate the original PRD', () => {
      const result = markStoryComplete(validPrd, 'US-001');
      expect(validPrd.userStories.find((s) => s.id === 'US-001')!.passes).toBe(false);
      expect(result).not.toBe(validPrd);
    });

    it('should add notes when provided', () => {
      const result = markStoryComplete(validPrd, 'US-001', 'Completed with minor adjustments');
      const story = result.userStories.find((s) => s.id === 'US-001')!;
      expect(story.passes).toBe(true);
      expect(story.notes).toBe('Completed with minor adjustments');
    });

    it('should throw for non-existent story ID', () => {
      expect(() => markStoryComplete(validPrd, 'US-999')).toThrow('Story "US-999" not found in PRD');
    });

    it('should not affect other stories', () => {
      const result = markStoryComplete(validPrd, 'US-001');
      expect(result.userStories.find((s) => s.id === 'US-002')!.passes).toBe(false);
      expect(result.userStories.find((s) => s.id === 'US-003')!.passes).toBe(true);
    });
  });

  describe('isAllComplete', () => {
    it('should return false when some stories are incomplete', () => {
      expect(isAllComplete(validPrd)).toBe(false);
    });

    it('should return true when all stories are complete', () => {
      const prd: RalphPrd = {
        ...validPrd,
        userStories: validPrd.userStories.map((s) => ({ ...s, passes: true })),
      };
      expect(isAllComplete(prd)).toBe(true);
    });
  });

  describe('getCompletionStats', () => {
    it('should return correct stats', () => {
      const stats = getCompletionStats(validPrd);
      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(1);
      expect(stats.remaining).toBe(2);
      expect(stats.percentage).toBe(33);
    });

    it('should handle all complete', () => {
      const prd: RalphPrd = {
        ...validPrd,
        userStories: validPrd.userStories.map((s) => ({ ...s, passes: true })),
      };
      const stats = getCompletionStats(prd);
      expect(stats.completed).toBe(3);
      expect(stats.remaining).toBe(0);
      expect(stats.percentage).toBe(100);
    });

    it('should handle none complete', () => {
      const prd: RalphPrd = {
        ...validPrd,
        userStories: validPrd.userStories.map((s) => ({ ...s, passes: false })),
      };
      const stats = getCompletionStats(prd);
      expect(stats.completed).toBe(0);
      expect(stats.remaining).toBe(3);
      expect(stats.percentage).toBe(0);
    });
  });

  describe('createEmptyPrd', () => {
    it('should create an empty PRD with the given fields', () => {
      const prd = createEmptyPrd('my-project', 'ralph/feature', 'A new feature');
      expect(prd.project).toBe('my-project');
      expect(prd.branchName).toBe('ralph/feature');
      expect(prd.description).toBe('A new feature');
      expect(prd.userStories).toEqual([]);
    });
  });

  describe('addUserStory', () => {
    it('should add a user story with passes=false', () => {
      const prd = createEmptyPrd('proj', 'ralph/feat', 'desc');
      const result = addUserStory(prd, {
        id: 'US-001',
        title: 'Test',
        description: 'Test desc',
        acceptanceCriteria: ['AC1'],
        priority: 1,
      });
      expect(result.userStories).toHaveLength(1);
      expect(result.userStories[0].passes).toBe(false);
      expect(result.userStories[0].id).toBe('US-001');
    });

    it('should not mutate the original PRD', () => {
      const prd = createEmptyPrd('proj', 'ralph/feat', 'desc');
      const result = addUserStory(prd, {
        id: 'US-001',
        title: 'Test',
        description: 'Test desc',
        acceptanceCriteria: ['AC1'],
        priority: 1,
      });
      expect(prd.userStories).toHaveLength(0);
      expect(result.userStories).toHaveLength(1);
    });
  });
});
