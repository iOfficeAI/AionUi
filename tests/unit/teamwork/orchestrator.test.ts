/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  TeamworkOrchestrator,
  DefaultTeamworkRunner,
  type ITeamworkRunner,
  type SubagentExecutionParams,
  type SubagentExecutionResult,
  type MilestoneVerificationResult,
} from '@/process/services/teamwork/orchestrator';
import type { TeamworkSessionState } from '@/common/types/teamwork';

describe('TeamworkOrchestrator', () => {
  let tempDir: string;
  let orchestrator: TeamworkOrchestrator;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'orchestrator-test-'));
    orchestrator = new TeamworkOrchestrator(undefined, 2);
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('Session Initiation & Querying', () => {
    it('should initialize a session in interview phase with questions and zero tokens', () => {
      const session = orchestrator.initiateSession({
        conversationId: 'conv-123',
        userRequest: 'Build a multi-agent system',
        workspace: tempDir,
      });

      expect(session.sessionId).toMatch(/^teamwork_/);
      expect(session.conversationId).toBe('conv-123');
      expect(session.userRequest).toBe('Build a multi-agent system');
      expect(session.workspace).toBe(tempDir);
      expect(session.phase).toBe('interview');
      expect(session.questions.length).toBeGreaterThanOrEqual(3);
      expect(session.answers).toEqual({});
      expect(session.milestones).toHaveLength(0);
      expect(session.tokenConsumption).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
      expect(session.agentStatuses.sentinel.role).toBe('sentinel');
      expect(session.agentStatuses.explorer.role).toBe('explorer');
      expect(session.agentStatuses.worker.role).toBe('worker');
      expect(session.agentStatuses.auditor.role).toBe('auditor');
    });

    it('should find session by sessionId and conversationId', () => {
      const session = orchestrator.initiateSession({
        conversationId: 'conv-abc',
        userRequest: 'Sample request',
        workspace: tempDir,
      });

      const foundById = orchestrator.getSession(session.sessionId);
      expect(foundById).toBe(session);

      const foundByConv = orchestrator.getSessionByConversationId('conv-abc');
      expect(foundByConv).toBe(session);

      expect(orchestrator.getSession('non-existent')).toBeUndefined();
      expect(orchestrator.getSessionByConversationId('non-existent')).toBeUndefined();
    });

    it('should return all tracked sessions', () => {
      orchestrator.initiateSession({ conversationId: 'c1', userRequest: 'r1', workspace: tempDir });
      orchestrator.initiateSession({ conversationId: 'c2', userRequest: 'r2', workspace: tempDir });

      const all = orchestrator.getAllSessions();
      expect(all).toHaveLength(2);
    });

    it('should notify registered listeners and allow unsubscribing', () => {
      const listener = vi.fn();
      const unsubscribe = orchestrator.onStatusUpdate(listener);

      const session = orchestrator.initiateSession({
        conversationId: 'conv-notify',
        userRequest: 'Notify test',
        workspace: tempDir,
      });

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ sessionId: session.sessionId }));

      listener.mockClear();
      unsubscribe();

      orchestrator.initiateSession({
        conversationId: 'conv-after-unsub',
        userRequest: 'After unsub',
        workspace: tempDir,
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Phase 1: Interview & Plan Generation', () => {
    it('should transition to plan_ready and generate artifacts upon interview submission', async () => {
      const session = orchestrator.initiateSession({
        conversationId: 'conv-plan',
        userRequest: 'Add teamwork mode',
        workspace: tempDir,
      });

      const answers = {
        q_arch: 'Modular React components with Arco Design',
        q_test: '80% Vitest coverage',
      };

      const updated = await orchestrator.submitInterview({
        sessionId: session.sessionId,
        answers,
      });

      expect(updated.phase).toBe('plan_ready');
      expect(updated.answers).toEqual(answers);
      expect(updated.originalRequestDoc).toContain('# ORIGINAL_REQUEST.md');
      expect(updated.projectPlanDoc).toContain('# PROJECT_PLAN.md');
      expect(updated.milestones.length).toBeGreaterThan(0);

      // Verify physical files were written to disk
      const originalPath = path.join(tempDir, 'ORIGINAL_REQUEST.md');
      const planPath = path.join(tempDir, 'PROJECT_PLAN.md');
      expect(fs.existsSync(originalPath)).toBe(true);
      expect(fs.existsSync(planPath)).toBe(true);
    });

    it('should throw an error when submitting answers for a non-existent session', async () => {
      await expect(
        orchestrator.submitInterview({
          sessionId: 'fake-id',
          answers: {},
        })
      ).rejects.toThrow('Teamwork session fake-id not found');
    });
  });

  describe('Phase 2: Plan Confirmation & Milestone Execution', () => {
    it('should throw when confirming a plan that is not in plan_ready phase', async () => {
      const session = orchestrator.initiateSession({
        conversationId: 'conv-not-ready',
        userRequest: 'Test phase guard',
        workspace: tempDir,
      });

      await expect(orchestrator.confirmPlan({ sessionId: session.sessionId })).rejects.toThrow(
        "Cannot confirm plan while in phase 'interview'"
      );
    });

    it('should throw when confirming a non-existent session', async () => {
      await expect(orchestrator.confirmPlan({ sessionId: 'unknown-session' })).rejects.toThrow(
        'Teamwork session unknown-session not found'
      );
    });

    it('should execute all milestones sequentially and reach completed phase with DefaultTeamworkRunner', async () => {
      const session = orchestrator.initiateSession({
        conversationId: 'conv-exec-all',
        userRequest: 'Full execution pipeline',
        workspace: tempDir,
      });

      await orchestrator.submitInterview({
        sessionId: session.sessionId,
        answers: { q_arch: 'IPC bridge' },
      });

      // Confirm plan - triggers async execution
      await orchestrator.confirmPlan({ sessionId: session.sessionId });

      // Wait until completed
      await vi.waitFor(
        () => {
          const current = orchestrator.getSession(session.sessionId);
          expect(current?.phase).toBe('completed');
        },
        { timeout: 5000, interval: 50 }
      );

      const finalSession = orchestrator.getSession(session.sessionId);
      expect(finalSession).toBeDefined();
      expect(finalSession?.phase).toBe('completed');
      expect(finalSession?.activeRole).toBe('sentinel');
      expect(finalSession?.activeMilestoneId).toBeUndefined();

      // Check all milestones verified
      for (const m of finalSession!.milestones) {
        expect(m.status).toBe('verified');
        for (const st of m.subtasks) {
          expect(st.status).toBe('completed');
        }
      }

      // Check token consumption was accumulated
      expect(finalSession!.tokenConsumption.totalTokens).toBeGreaterThan(0);
      expect(finalSession!.agentStatuses.explorer.tokenConsumption.totalTokens).toBeGreaterThan(0);
      expect(finalSession!.agentStatuses.worker.tokenConsumption.totalTokens).toBeGreaterThan(0);
      expect(finalSession!.agentStatuses.auditor.tokenConsumption.totalTokens).toBeGreaterThan(0);
    });

    it('should handle verification failure and retry successfully when Auditor passes on second attempt', async () => {
      let auditCallCount = 0;
      const customRunner: ITeamworkRunner = {
        runSubagent: vi.fn().mockResolvedValue({
          success: true,
          output: 'Subagent output',
          tokensUsed: { inputTokens: 100, outputTokens: 50 },
        }),
        verifyMilestone: vi.fn().mockImplementation(async () => {
          auditCallCount++;
          if (auditCallCount === 1) {
            // First audit fails
            return {
              passed: false,
              notes: 'Missing edge case handling in tests',
              tokensUsed: { inputTokens: 100, outputTokens: 50 },
            };
          }
          // Subsequent audits pass
          return {
            passed: true,
            notes: 'All checks passed cleanly',
            tokensUsed: { inputTokens: 100, outputTokens: 50 },
          };
        }),
      };

      const customOrchestrator = new TeamworkOrchestrator(customRunner, 2);
      const session = customOrchestrator.initiateSession({
        conversationId: 'conv-retry-audit',
        userRequest: 'Retry audit test',
        workspace: tempDir,
      });

      await customOrchestrator.submitInterview({
        sessionId: session.sessionId,
        answers: {},
      });

      // Keep only 1 milestone to keep test focused
      session.milestones = session.milestones.slice(0, 1);

      await customOrchestrator.confirmPlan({ sessionId: session.sessionId });

      await vi.waitFor(
        () => {
          const current = customOrchestrator.getSession(session.sessionId);
          expect(current?.phase).toBe('completed');
        },
        { timeout: 5000, interval: 50 }
      );

      expect(auditCallCount).toBe(2);
      expect(customOrchestrator.getSession(session.sessionId)?.milestones[0].status).toBe('verified');
    });

    it('should transition to failed phase when Auditor rejects beyond max retries', async () => {
      const failingRunner: ITeamworkRunner = {
        runSubagent: vi.fn().mockResolvedValue({
          success: true,
          output: 'Subagent output',
          tokensUsed: { inputTokens: 50, outputTokens: 25 },
        }),
        verifyMilestone: vi.fn().mockResolvedValue({
          passed: false,
          notes: 'Unresolved mock implementation detected',
          tokensUsed: { inputTokens: 50, outputTokens: 25 },
        }),
      };

      const customOrchestrator = new TeamworkOrchestrator(failingRunner, 1);
      const session = customOrchestrator.initiateSession({
        conversationId: 'conv-audit-fail',
        userRequest: 'Strict audit failure',
        workspace: tempDir,
      });

      await customOrchestrator.submitInterview({
        sessionId: session.sessionId,
        answers: {},
      });

      session.milestones = session.milestones.slice(0, 1);

      await customOrchestrator.confirmPlan({ sessionId: session.sessionId });

      await vi.waitFor(
        () => {
          const current = customOrchestrator.getSession(session.sessionId);
          expect(current?.phase).toBe('failed');
        },
        { timeout: 5000, interval: 50 }
      );

      const finalState = customOrchestrator.getSession(session.sessionId);
      expect(finalState?.phase).toBe('failed');
      expect(finalState?.error).toContain('Verification gate failed');
      expect(finalState?.milestones[0].status).toBe('failed');
    });

    it('should transition to failed phase when Explorer subagent fails', async () => {
      const explorerFailRunner: ITeamworkRunner = {
        runSubagent: vi.fn().mockImplementation(async (params: SubagentExecutionParams) => {
          if (params.role === 'explorer') {
            return {
              success: false,
              output: '',
              error: 'AST parser encountered syntax error in entrypoint',
              tokensUsed: { inputTokens: 10, outputTokens: 5 },
            };
          }
          return { success: true, output: 'ok', tokensUsed: { inputTokens: 10, outputTokens: 5 } };
        }),
        verifyMilestone: vi.fn().mockResolvedValue({
          passed: true,
          notes: 'OK',
          tokensUsed: { inputTokens: 10, outputTokens: 5 },
        }),
      };

      const customOrchestrator = new TeamworkOrchestrator(explorerFailRunner);
      const session = customOrchestrator.initiateSession({
        conversationId: 'conv-explorer-fail',
        userRequest: 'Explorer failure test',
        workspace: tempDir,
      });

      await customOrchestrator.submitInterview({ sessionId: session.sessionId, answers: {} });
      session.milestones = session.milestones.slice(0, 1);

      await customOrchestrator.confirmPlan({ sessionId: session.sessionId });

      await vi.waitFor(
        () => {
          const current = customOrchestrator.getSession(session.sessionId);
          expect(current?.phase).toBe('failed');
        },
        { timeout: 5000, interval: 50 }
      );

      const finalState = customOrchestrator.getSession(session.sessionId);
      expect(finalState?.phase).toBe('failed');
      expect(finalState?.error).toContain('Explorer failed');
    });

    it('should transition to failed phase when Worker subagent fails', async () => {
      const workerFailRunner: ITeamworkRunner = {
        runSubagent: vi.fn().mockImplementation(async (params: SubagentExecutionParams) => {
          if (params.role === 'worker') {
            return {
              success: false,
              output: '',
              error: 'File write permission denied',
              tokensUsed: { inputTokens: 10, outputTokens: 5 },
            };
          }
          return { success: true, output: 'ok', tokensUsed: { inputTokens: 10, outputTokens: 5 } };
        }),
        verifyMilestone: vi.fn().mockResolvedValue({
          passed: true,
          notes: 'OK',
          tokensUsed: { inputTokens: 10, outputTokens: 5 },
        }),
      };

      const customOrchestrator = new TeamworkOrchestrator(workerFailRunner);
      const session = customOrchestrator.initiateSession({
        conversationId: 'conv-worker-fail',
        userRequest: 'Worker failure test',
        workspace: tempDir,
      });

      await customOrchestrator.submitInterview({ sessionId: session.sessionId, answers: {} });
      session.milestones = session.milestones.slice(0, 1);

      await customOrchestrator.confirmPlan({ sessionId: session.sessionId });

      await vi.waitFor(
        () => {
          const current = customOrchestrator.getSession(session.sessionId);
          expect(current?.phase).toBe('failed');
        },
        { timeout: 5000, interval: 50 }
      );

      const finalState = customOrchestrator.getSession(session.sessionId);
      expect(finalState?.phase).toBe('failed');
      expect(finalState?.error).toContain('Worker failed');
    });
  });

  describe('Session Abort', () => {
    it('should immediately halt execution and set phase to failed with user reason', () => {
      const session = orchestrator.initiateSession({
        conversationId: 'conv-abort',
        userRequest: 'Abort test',
        workspace: tempDir,
      });

      orchestrator.abortSession({
        sessionId: session.sessionId,
        reason: 'User cancelled via UI',
      });

      expect(session.phase).toBe('failed');
      expect(session.error).toBe('User cancelled via UI');
      expect(session.agentStatuses.sentinel.isExecuting).toBe(false);
      expect(session.agentStatuses.explorer.isExecuting).toBe(false);
      expect(session.agentStatuses.worker.isExecuting).toBe(false);
      expect(session.agentStatuses.auditor.isExecuting).toBe(false);
    });

    it('should throw an error when aborting a non-existent session', () => {
      expect(() => orchestrator.abortSession({ sessionId: 'missing-id' })).toThrow(
        'Teamwork session missing-id not found'
      );
    });
  });
});
