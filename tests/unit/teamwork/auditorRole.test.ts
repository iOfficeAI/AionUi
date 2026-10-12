/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { AUDITOR_ROLE_CONFIG, verifyMilestoneDiff } from '@/process/services/teamwork/auditorRole';
import type { TeamMilestone } from '@/common/types/teamwork';

describe('Adversarial Auditor Role & Verification Gate', () => {
  const sampleMilestone: TeamMilestone = {
    id: 'm1',
    title: 'Milestone 1: Domain Models',
    criteria: ['Strict TypeScript types with no any', 'Unit test coverage >= 80%', 'No placeholder stubs'],
    status: 'in_progress',
  };

  describe('AUDITOR_ROLE_CONFIG', () => {
    it('should configure the Auditor role with strictly non-destructive allowed actions', () => {
      expect(AUDITOR_ROLE_CONFIG.role).toBe('auditor');
      expect(AUDITOR_ROLE_CONFIG.badgeColor).toBe('#00b42a');

      // Verify allowed non-destructive actions
      expect(AUDITOR_ROLE_CONFIG.allowedActions).toContain('git_diff');
      expect(AUDITOR_ROLE_CONFIG.allowedActions).toContain('run_tests');
      expect(AUDITOR_ROLE_CONFIG.allowedActions).toContain('run_linter');
      expect(AUDITOR_ROLE_CONFIG.allowedActions).toContain('view_file');

      // Verify forbidden destructive write actions are NOT in allowedActions
      expect(AUDITOR_ROLE_CONFIG.allowedActions).not.toContain('write_file');
      expect(AUDITOR_ROLE_CONFIG.allowedActions).not.toContain('replace_file_content');
      expect(AUDITOR_ROLE_CONFIG.allowedActions).not.toContain('delete_file');
    });

    it('should include adversarial verification rules in system prompt', () => {
      expect(AUDITOR_ROLE_CONFIG.systemPrompt).toContain('Adversarial Auditor');
      expect(AUDITOR_ROLE_CONFIG.systemPrompt).toContain('No Mock Placeholders');
      expect(AUDITOR_ROLE_CONFIG.systemPrompt).toContain('Non-Destructive Authority');
      expect(AUDITOR_ROLE_CONFIG.systemPrompt).toContain('PASS');
      expect(AUDITOR_ROLE_CONFIG.systemPrompt).toContain('REJECT');
    });
  });

  describe('verifyMilestoneDiff', () => {
    it('should reject git diff containing TODO: implement placeholders', async () => {
      const result = await verifyMilestoneDiff({
        workspace: '/workspace',
        milestone: sampleMilestone,
        diffSummary: `
+ export const handler = () => {
+   // TODO: implement concrete logic
+   return null;
+ };
`,
      });

      expect(result.passed).toBe(false);
      expect(result.notes).toContain('Incomplete implementation detected');
      expect(result.remediation).toContain('TODO');
      expect(result.toolCalls).toContain('git_diff');
    });

    it('should reject git diff containing throw new Error("not implemented")', async () => {
      const result = await verifyMilestoneDiff({
        workspace: '/workspace',
        milestone: sampleMilestone,
        diffSummary: '+ throw new Error("not implemented");',
      });

      expect(result.passed).toBe(false);
      expect(result.notes).toContain('Incomplete implementation detected');
      expect(result.remediation).toContain('not implemented');
    });

    it('should reject when test output contains FAIL', async () => {
      const result = await verifyMilestoneDiff({
        workspace: '/workspace',
        milestone: sampleMilestone,
        diffSummary: '+ export const sum = (a, b) => a + b;',
        testOutput: 'FAIL tests/unit/sum.test.ts > expected 5 but received 4',
      });

      expect(result.passed).toBe(false);
      expect(result.notes).toContain('Test failures present');
      expect(result.remediation).toContain('Resolve test failures');
    });

    it('should reject when command runner reports test failure (exit code != 0)', async () => {
      const failingRunner = async () => ({
        stdout: '',
        stderr: 'Tests failed: 2 broken assertions',
        exitCode: 1,
      });

      const result = await verifyMilestoneDiff({
        workspace: '/workspace',
        milestone: sampleMilestone,
        diffSummary: '+ valid code changes',
        runner: failingRunner,
      });

      expect(result.passed).toBe(false);
      expect(result.notes).toContain('Test suite execution failed');
      expect(result.remediation).toContain('Tests failed: 2 broken assertions');
      expect(result.toolCalls).toContain('run_tests');
    });

    it('should pass cleanly when git diff is complete and tests succeed', async () => {
      const successfulRunner = async () => ({
        stdout: 'All 15 tests passed',
        stderr: '',
        exitCode: 0,
      });

      const result = await verifyMilestoneDiff({
        workspace: '/workspace',
        milestone: sampleMilestone,
        diffSummary: `
+ export function sum(a: number, b: number): number {
+   return a + b;
+ }
`,
        runner: successfulRunner,
      });

      expect(result.passed).toBe(true);
      expect(result.notes).toContain('Auditor verified all 3 acceptance criteria');
      expect(result.toolCalls).toContain('git_diff');
      expect(result.toolCalls).toContain('run_tests');
      expect(result.toolCalls).toContain('verify_criteria');
      expect(
        result.tokensUsed.totalTokens ?? result.tokensUsed.inputTokens + result.tokensUsed.outputTokens
      ).toBeGreaterThan(0);
    });
  });
});
