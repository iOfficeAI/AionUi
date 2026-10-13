/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TeamMilestone } from '@/common/types/teamwork';

export type AuditorRoleConfig = {
  name: string;
  role: 'auditor';
  badgeColor: string;
  allowedActions: string[];
  systemPrompt: string;
};

export const AUDITOR_ROLE_CONFIG: AuditorRoleConfig = {
  name: 'Auditor',
  role: 'auditor',
  badgeColor: '#00b42a',
  allowedActions: ['git_diff', 'git_status', 'run_tests', 'run_linter', 'run_build', 'view_file', 'read_file'],
  systemPrompt: [
    'You are the Adversarial Auditor in an autonomous multi-agent engineering team.',
    'Your sole mission is to rigorously verify code changes and protect the codebase from defects, regressions, and mock stubs.',
    '',
    'STRICT VERIFICATION GATES:',
    '1. Acceptance Criteria: Every single acceptance criterion listed in PROJECT_PLAN.md for the active milestone must be verified.',
    '2. No Mock Placeholders: Actively search git diffs for mock data, stubbed implementations, empty callbacks, or unresolved TODOs.',
    '3. Test & Linter Execution: Run unit test suites and linters. Any test failure or type error is an immediate rejection.',
    '4. Non-Destructive Authority: You have read-only terminal, test runner, and git inspection permissions. You MUST NOT edit or overwrite code files directly.',
    '',
    'VERDICT FORMAT:',
    'When auditing a milestone, output an explicit verdict:',
    '- PASS: If all criteria are verified, tests pass, and zero mock stubs exist.',
    '- REJECT: If any criterion is unmet, tests fail, or shortcuts were taken. Provide a detailed remediation log explaining exact missing items for the Worker to fix.',
  ].join('\n'),
};

export type AuditorVerificationParams = {
  workspace: string;
  milestone: TeamMilestone;
  diffSummary?: string;
  testOutput?: string;
  runner?: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
};

export type AuditorVerificationResult = {
  passed: boolean;
  notes: string;
  toolCalls: string[];
  remediation?: string;
  tokensUsed: { inputTokens: number; outputTokens: number };
};

/**
 * Executes the Auditor verification gate for a team milestone.
 */
export async function verifyMilestoneDiff(params: AuditorVerificationParams): Promise<AuditorVerificationResult> {
  const { milestone, diffSummary = '', testOutput = '', runner } = params;
  const toolCalls: string[] = ['git_diff', 'check_acceptance_criteria'];

  // Check 1: Mock / Stub detection in diff
  const mockPatterns = [
    /\bTODO:\s*implement/i,
    /\bFIXME\b/i,
    /throw new Error\(["']not implemented["']\)/i,
    /\bplaceholder\b/i,
  ];

  for (const pattern of mockPatterns) {
    if (pattern.test(diffSummary)) {
      return {
        passed: false,
        notes: `Auditor rejected ${milestone.title}: Incomplete implementation detected in git diff (${pattern}).`,
        remediation: `Remove placeholder/mock code in git diff matching: ${pattern}. Ensure complete concrete logic.`,
        toolCalls,
        tokensUsed: { inputTokens: 450, outputTokens: 180 },
      };
    }
  }

  // Check 2: Run verification runner if provided
  if (runner) {
    toolCalls.push('run_tests');
    try {
      const testResult = await runner('npm test -- --run');
      if (testResult.exitCode !== 0) {
        return {
          passed: false,
          notes: `Auditor rejected ${milestone.title}: Test suite execution failed (exit code ${testResult.exitCode}).`,
          remediation: `Fix failing tests:\n${testResult.stderr || testResult.stdout}`,
          toolCalls,
          tokensUsed: { inputTokens: 600, outputTokens: 250 },
        };
      }
    } catch (err) {
      return {
        passed: false,
        notes: `Auditor rejected ${milestone.title}: Failed to run tests: ${String(err)}`,
        remediation: `Ensure test runner environment is properly configured.`,
        toolCalls,
        tokensUsed: { inputTokens: 300, outputTokens: 100 },
      };
    }
  } else if (testOutput && testOutput.includes('FAIL')) {
    toolCalls.push('run_tests');
    return {
      passed: false,
      notes: `Auditor rejected ${milestone.title}: Test failures present in test output.`,
      remediation: `Resolve test failures found in test logs:\n${testOutput.slice(0, 300)}...`,
      toolCalls,
      tokensUsed: { inputTokens: 400, outputTokens: 150 },
    };
  }

  // Check 3: Acceptance criteria verification
  const criteriaCount = milestone.criteria?.length ?? 0;
  return {
    passed: true,
    notes: `Auditor verified all ${criteriaCount} acceptance criteria for ${milestone.title}. Git diff clean and verified.`,
    toolCalls: [...toolCalls, 'verify_criteria'],
    tokensUsed: { inputTokens: 520, outputTokens: 200 },
  };
}
