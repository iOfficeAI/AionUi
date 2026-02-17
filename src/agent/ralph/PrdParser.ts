/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RalphPrd, RalphUserStory } from './types';

/**
 * Validation error with details about what went wrong.
 */
export class PrdValidationError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(`PRD validation failed: ${errors.join('; ')}`);
    this.name = 'PrdValidationError';
    this.errors = errors;
  }
}

/**
 * Validate a PRD object structure and return any errors found.
 */
export function validatePrd(prd: unknown): string[] {
  const errors: string[] = [];

  if (!prd || typeof prd !== 'object') {
    return ['PRD must be a non-null object'];
  }

  const p = prd as Record<string, unknown>;

  if (typeof p.project !== 'string' || p.project.trim() === '') {
    errors.push('project must be a non-empty string');
  }

  if (typeof p.branchName !== 'string' || p.branchName.trim() === '') {
    errors.push('branchName must be a non-empty string');
  }

  if (typeof p.description !== 'string' || p.description.trim() === '') {
    errors.push('description must be a non-empty string');
  }

  if (!Array.isArray(p.userStories)) {
    errors.push('userStories must be an array');
    return errors;
  }

  if (p.userStories.length === 0) {
    errors.push('userStories must contain at least one story');
    return errors;
  }

  const seenIds = new Set<string>();
  const seenPriorities = new Set<number>();

  for (let i = 0; i < p.userStories.length; i++) {
    const story = p.userStories[i] as Record<string, unknown>;
    const prefix = `userStories[${i}]`;

    if (!story || typeof story !== 'object') {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    if (typeof story.id !== 'string' || story.id.trim() === '') {
      errors.push(`${prefix}.id must be a non-empty string`);
    } else if (seenIds.has(story.id as string)) {
      errors.push(`${prefix}.id "${story.id}" is duplicated`);
    } else {
      seenIds.add(story.id as string);
    }

    if (typeof story.title !== 'string' || story.title.trim() === '') {
      errors.push(`${prefix}.title must be a non-empty string`);
    }

    if (typeof story.description !== 'string' || story.description.trim() === '') {
      errors.push(`${prefix}.description must be a non-empty string`);
    }

    if (!Array.isArray(story.acceptanceCriteria) || story.acceptanceCriteria.length === 0) {
      errors.push(`${prefix}.acceptanceCriteria must be a non-empty array`);
    } else {
      for (let j = 0; j < (story.acceptanceCriteria as unknown[]).length; j++) {
        if (typeof (story.acceptanceCriteria as unknown[])[j] !== 'string') {
          errors.push(`${prefix}.acceptanceCriteria[${j}] must be a string`);
        }
      }
    }

    if (typeof story.priority !== 'number' || !Number.isInteger(story.priority) || (story.priority as number) < 1) {
      errors.push(`${prefix}.priority must be a positive integer`);
    } else if (seenPriorities.has(story.priority as number)) {
      errors.push(`${prefix}.priority ${story.priority} is duplicated`);
    } else {
      seenPriorities.add(story.priority as number);
    }

    if (typeof story.passes !== 'boolean') {
      errors.push(`${prefix}.passes must be a boolean`);
    }
  }

  return errors;
}

/**
 * Parse a JSON string into a validated RalphPrd.
 * Throws PrdValidationError if the JSON is invalid or the structure is wrong.
 */
export function parsePrd(jsonString: string): RalphPrd {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new PrdValidationError(['Invalid JSON: ' + (jsonString.length > 100 ? jsonString.slice(0, 100) + '...' : jsonString)]);
  }

  const errors = validatePrd(parsed);
  if (errors.length > 0) {
    throw new PrdValidationError(errors);
  }

  return parsed as RalphPrd;
}

/**
 * Get the next incomplete user story by priority (lowest priority number first).
 * Returns null if all stories are complete.
 */
export function getNextStory(prd: RalphPrd): RalphUserStory | null {
  const incomplete = prd.userStories.filter((s) => !s.passes).sort((a, b) => a.priority - b.priority);

  return incomplete.length > 0 ? incomplete[0] : null;
}

/**
 * Mark a story as complete in the PRD (returns a new PRD object).
 */
export function markStoryComplete(prd: RalphPrd, storyId: string, notes?: string): RalphPrd {
  const storyIndex = prd.userStories.findIndex((s) => s.id === storyId);
  if (storyIndex === -1) {
    throw new Error(`Story "${storyId}" not found in PRD`);
  }

  const updatedStories = prd.userStories.map((s) => (s.id === storyId ? { ...s, passes: true, ...(notes ? { notes } : {}) } : s));

  return { ...prd, userStories: updatedStories };
}

/**
 * Check if all user stories have passed.
 */
export function isAllComplete(prd: RalphPrd): boolean {
  return prd.userStories.every((s) => s.passes);
}

/**
 * Get completion statistics.
 */
export function getCompletionStats(prd: RalphPrd): {
  total: number;
  completed: number;
  remaining: number;
  percentage: number;
} {
  const total = prd.userStories.length;
  const completed = prd.userStories.filter((s) => s.passes).length;
  const remaining = total - completed;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, remaining, percentage };
}

/**
 * Create an empty PRD template.
 */
export function createEmptyPrd(project: string, branchName: string, description: string): RalphPrd {
  return {
    project,
    branchName,
    description,
    userStories: [],
  };
}

/**
 * Add a user story to a PRD (returns a new PRD object).
 */
export function addUserStory(prd: RalphPrd, story: Omit<RalphUserStory, 'passes'>): RalphPrd {
  const newStory: RalphUserStory = { ...story, passes: false };
  return { ...prd, userStories: [...prd.userStories, newStory] };
}
