/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from '@jest/globals';
import { buildIterationPrompt, buildPrdGenerationPrompt } from '@/agent/ralph/RalphPromptBuilder';
import { RALPH_COMPLETION_SIGNAL } from '@/agent/ralph/types';
import type { RalphPrd } from '@/agent/ralph/types';

const testPrd: RalphPrd = {
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
  ],
};

describe('RalphPromptBuilder', () => {
  describe('buildIterationPrompt', () => {
    it('should include project context', () => {
      const prompt = buildIterationPrompt(testPrd, '', '', 1, 10);
      expect(prompt).toContain('test-project');
      expect(prompt).toContain('ralph/test-feature');
      expect(prompt).toContain('Test feature description');
    });

    it('should include iteration number', () => {
      const prompt = buildIterationPrompt(testPrd, '', '', 3, 10);
      expect(prompt).toContain('Iteration 3/10');
    });

    it('should include the current story details', () => {
      const prompt = buildIterationPrompt(testPrd, '', '', 1, 10);
      expect(prompt).toContain('US-001');
      expect(prompt).toContain('First story');
      expect(prompt).toContain('As a user, I want X so that Y');
      expect(prompt).toContain('Criterion 1');
      expect(prompt).toContain('Criterion 2');
    });

    it('should mark the current story in the remaining list', () => {
      const prompt = buildIterationPrompt(testPrd, '', '', 1, 10);
      expect(prompt).toContain('**[CURRENT]** US-001');
    });

    it('should include progress stats', () => {
      const prompt = buildIterationPrompt(testPrd, '', '', 1, 10);
      expect(prompt).toContain('0/2 stories complete (0%)');
    });

    it('should include previous progress when provided', () => {
      const progress = 'Previous iteration completed US-001 successfully.';
      const prompt = buildIterationPrompt(testPrd, progress, '', 2, 10);
      expect(prompt).toContain('## Previous Progress');
      expect(prompt).toContain(progress);
    });

    it('should include AGENTS.md content when provided', () => {
      const agents = 'Use camelCase for all functions.';
      const prompt = buildIterationPrompt(testPrd, '', agents, 1, 10);
      expect(prompt).toContain('## Accumulated Learnings');
      expect(prompt).toContain(agents);
    });

    it('should not include progress section when empty', () => {
      const prompt = buildIterationPrompt(testPrd, '', '', 1, 10);
      expect(prompt).not.toContain('## Previous Progress');
    });

    it('should not include learnings section when empty', () => {
      const prompt = buildIterationPrompt(testPrd, '', '', 1, 10);
      expect(prompt).not.toContain('## Accumulated Learnings');
    });

    it('should include instructions section', () => {
      const prompt = buildIterationPrompt(testPrd, '', '', 1, 10);
      expect(prompt).toContain('## Instructions');
      expect(prompt).toContain('Step 1: Verify Environment');
      expect(prompt).toContain('Step 2: Implement the Current Story');
      expect(prompt).toContain('Step 3: Quality Checks');
      expect(prompt).toContain('Step 4: Commit');
      expect(prompt).toContain('Step 5: Report Results');
    });

    it('should mention completion signal info for multi-story case', () => {
      const prompt = buildIterationPrompt(testPrd, '', '', 1, 10);
      expect(prompt).toContain('2 stories remaining');
      expect(prompt).toContain('do NOT output the completion signal');
    });

    it('should instruct to output completion signal for last story', () => {
      const prd: RalphPrd = {
        ...testPrd,
        userStories: [
          { ...testPrd.userStories[0], passes: true },
          { ...testPrd.userStories[1], passes: false },
        ],
      };
      const prompt = buildIterationPrompt(prd, '', '', 2, 10);
      expect(prompt).toContain('LAST remaining story');
      expect(prompt).toContain(RALPH_COMPLETION_SIGNAL);
    });

    it('should show completed stories section when stories are done', () => {
      const prd: RalphPrd = {
        ...testPrd,
        userStories: [{ ...testPrd.userStories[0], passes: true, notes: 'Done easily' }, { ...testPrd.userStories[1] }],
      };
      const prompt = buildIterationPrompt(prd, '', '', 2, 10);
      expect(prompt).toContain('## Completed Stories');
      expect(prompt).toContain('US-001: First story (Done easily)');
    });

    it('should build completion check prompt when all stories are done', () => {
      const prd: RalphPrd = {
        ...testPrd,
        userStories: testPrd.userStories.map((s) => ({ ...s, passes: true })),
      };
      const prompt = buildIterationPrompt(prd, '', '', 3, 10);
      expect(prompt).toContain('All Stories Complete');
      expect(prompt).toContain('Final Verification');
      expect(prompt).toContain(RALPH_COMPLETION_SIGNAL);
    });

    it('should include story notes in prompt when present', () => {
      const prd: RalphPrd = {
        ...testPrd,
        userStories: [{ ...testPrd.userStories[0], notes: 'Remember to handle edge cases' }, { ...testPrd.userStories[1] }],
      };
      const prompt = buildIterationPrompt(prd, '', '', 1, 10);
      expect(prompt).toContain('Remember to handle edge cases');
    });
  });

  describe('buildPrdGenerationPrompt', () => {
    it('should include feature description', () => {
      const prompt = buildPrdGenerationPrompt('Add user authentication', 'my-app');
      expect(prompt).toContain('Add user authentication');
    });

    it('should include project name', () => {
      const prompt = buildPrdGenerationPrompt('Add auth', 'my-app');
      expect(prompt).toContain('my-app');
    });

    it('should include PRD JSON structure', () => {
      const prompt = buildPrdGenerationPrompt('Add auth', 'my-app');
      expect(prompt).toContain('"project"');
      expect(prompt).toContain('"branchName"');
      expect(prompt).toContain('"userStories"');
      expect(prompt).toContain('"acceptanceCriteria"');
    });

    it('should include story sizing rules', () => {
      const prompt = buildPrdGenerationPrompt('Add auth', 'my-app');
      expect(prompt).toContain('Story Sizing Rules');
      expect(prompt).toContain('ONE context window');
    });

    it('should include branch naming convention', () => {
      const prompt = buildPrdGenerationPrompt('Add auth', 'my-app');
      expect(prompt).toContain('ralph/');
      expect(prompt).toContain('kebab-case');
    });
  });
});
