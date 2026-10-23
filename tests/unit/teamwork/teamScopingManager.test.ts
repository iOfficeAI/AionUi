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
  TeamScopingManager,
  generateTeamScopingQuestions,
  synthesizeOriginalRequestDoc,
  synthesizeMilestones,
  synthesizeProjectPlanDoc,
} from '@/process/services/teamwork/scopingManager';
import type { ScopingQuestion } from '@/common/types/teamwork';

describe('TeamScopingManager & Scoping Engine', () => {
  let tempDir: string;
  let manager: TeamScopingManager;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'team-scoping-test-'));
    manager = new TeamScopingManager();
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('generateTeamScopingQuestions', () => {
    it('should generate targeted IPC questions for backend / API requests', () => {
      const questions = generateTeamScopingQuestions('Build backend IPC service for team orchestration');
      expect(questions.length).toBeGreaterThanOrEqual(4);

      const archQ = questions.find((q) => q.category === 'architecture');
      expect(archQ).toBeDefined();
      expect(archQ?.question).toContain('architectural communication pattern');
      expect(archQ?.options?.[0]).toContain('Typed IPC bridge');
    });

    it('should generate UI component architecture questions for React / UI requests', () => {
      const questions = generateTeamScopingQuestions('Create a new React UI component');
      const archQ = questions.find((q) => q.category === 'architecture');
      expect(archQ).toBeDefined();
      expect(archQ?.question).toContain('UI component architecture');
      expect(archQ?.options?.[0]).toContain('Arco Design');
    });

    it('should include questions covering testing bounds, constraints, and non-goals', () => {
      const questions = generateTeamScopingQuestions('General feature request');
      const categories = questions.map((q) => q.category);

      expect(categories).toContain('architecture');
      expect(categories).toContain('testing');
      expect(categories).toContain('constraints');
      expect(categories).toContain('scope');

      const testQ = questions.find((q) => q.category === 'testing');
      expect(testQ?.placeholder).toContain('coverage');

      const scopeQ = questions.find((q) => q.category === 'scope');
      expect(scopeQ?.question).toContain('out-of-scope');
    });
  });

  describe('synthesizeOriginalRequestDoc', () => {
    it('should synthesize ORIGINAL_REQUEST.md markdown containing request, interview Q&A, and constraints', () => {
      const questions: ScopingQuestion[] = [
        { id: 'q_arch', question: 'Arch?', category: 'architecture' },
        { id: 'q_test', question: 'Testing?', category: 'testing' },
      ];
      const answers = {
        q_arch: 'Typed IPC bridge',
        q_test: '>=80% coverage with Vitest',
      };

      const doc = synthesizeOriginalRequestDoc('Implement scoping workflow', questions, answers);

      expect(doc).toContain('# ORIGINAL_REQUEST.md');
      expect(doc).toContain('Implement scoping workflow');
      expect(doc).toContain('Typed IPC bridge');
      expect(doc).toContain('>=80% coverage with Vitest');
      expect(doc).toContain('Architectural Constraints & Non-Negotiable Bounds');
      expect(doc).toContain('Adversarial Gate');
    });

    it('should handle unanswered questions with default applied message', () => {
      const questions: ScopingQuestion[] = [
        { id: 'q1', question: 'Question without answer?', category: 'architecture' },
      ];
      const doc = synthesizeOriginalRequestDoc('Sample task', questions, {});
      expect(doc).toContain('Not specified (default applied)');
    });
  });

  describe('synthesizeMilestones & synthesizeProjectPlanDoc', () => {
    it('should produce 4 sequential milestones with subtasks assigned to Worker and Auditor', () => {
      const milestones = synthesizeMilestones('Task', [], {});
      expect(milestones).toHaveLength(4);

      expect(milestones[0].id).toBe('milestone-1');
      expect(milestones[0].status).toBe('pending');
      expect(milestones[0].criteria.length).toBeGreaterThan(0);

      const allSubtasks = milestones.flatMap((m) => m.subtasks || []);
      const roles = allSubtasks.map((st) => st.assignedRole);
      expect(roles).toContain('worker');
      expect(roles).toContain('auditor');
    });

    it('should synthesize PROJECT_PLAN.md with milestone hierarchy and verification gate protocol', () => {
      const milestones = synthesizeMilestones('Task', [], {});
      const doc = synthesizeProjectPlanDoc('Implement team scoping', milestones);

      expect(doc).toContain('# PROJECT_PLAN.md');
      expect(doc).toContain('Implement team scoping');
      expect(doc).toContain('Milestone 1:');
      expect(doc).toContain('Auditor Acceptance Criteria:');
      expect(doc).toContain('Verification Gate Protocol');
      expect(doc).toContain('Next milestone unlocks only upon explicit Auditor PASS verdict');
    });
  });

  describe('TeamScopingManager Lifecycle', () => {
    it('should initiate scoping interview and notify listeners', async () => {
      const listener = vi.fn();
      const unsubscribe = manager.onStatusUpdate(listener);

      const res = await manager.initiateScoping({
        team_id: 'team-1',
        userRequest: 'Refactor team communications',
        workspace: tempDir,
      });

      expect(res.success).toBe(true);
      expect(res.state?.status).toBe('scoping');
      expect(res.state?.questions.length).toBeGreaterThanOrEqual(4);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          team_id: 'team-1',
          state: expect.objectContaining({ status: 'scoping' }),
        })
      );

      unsubscribe();
    });

    it('should submit interview answers, synthesize docs, and write ORIGINAL_REQUEST.md & PROJECT_PLAN.md to workspace', async () => {
      await manager.initiateScoping({
        team_id: 'team-2',
        userRequest: 'Build multi-agent engine',
        workspace: tempDir,
      });

      const res = await manager.submitInterviewAnswers({
        team_id: 'team-2',
        answers: {
          q_arch: 'Typed IPC bridge',
          q_testing: '80% unit test coverage',
        },
      });

      expect(res.success).toBe(true);
      expect(res.state?.status).toBe('awaiting_plan_approval');
      expect(res.state?.plan?.milestones).toHaveLength(4);

      // Verify physical files were written to workspace root
      const originalPath = path.join(tempDir, 'ORIGINAL_REQUEST.md');
      const planPath = path.join(tempDir, 'PROJECT_PLAN.md');

      expect(fs.existsSync(originalPath)).toBe(true);
      expect(fs.existsSync(planPath)).toBe(true);

      const originalContent = await fs.promises.readFile(originalPath, 'utf-8');
      const planContent = await fs.promises.readFile(planPath, 'utf-8');

      expect(originalContent).toContain('Typed IPC bridge');
      expect(planContent).toContain('# PROJECT_PLAN.md');
    });

    it('should reject plan approval if not in awaiting_plan_approval status', async () => {
      await manager.initiateScoping({
        team_id: 'team-3',
        userRequest: 'Test phase guard',
        workspace: tempDir,
      });

      const res = await manager.approvePlan({ team_id: 'team-3' });
      expect(res.success).toBe(false);
      expect(res.error).toContain("Cannot approve plan while status is 'scoping'");
    });

    it('should approve plan and transition to executing with active milestone', async () => {
      await manager.initiateScoping({
        team_id: 'team-4',
        userRequest: 'Autonomous team execution',
        workspace: tempDir,
      });

      await manager.submitInterviewAnswers({ team_id: 'team-4', answers: {} });

      const res = await manager.approvePlan({
        team_id: 'team-4',
        planMarkdown: '# Updated Custom PROJECT_PLAN.md',
      });

      expect(res.success).toBe(true);
      expect(res.state?.status).toBe('executing');
      expect(res.state?.activeMilestoneId).toBe('milestone-1');
      expect(res.state?.activeRole).toBe('worker');
      expect(res.state?.projectPlanDoc).toBe('# Updated Custom PROJECT_PLAN.md');

      // Verify updated file on disk
      const updatedPlan = await fs.promises.readFile(path.join(tempDir, 'PROJECT_PLAN.md'), 'utf-8');
      expect(updatedPlan).toBe('# Updated Custom PROJECT_PLAN.md');
    });

    it('should reject plan and return status to scoping with reason', async () => {
      await manager.initiateScoping({
        team_id: 'team-5',
        userRequest: 'Rejection test',
        workspace: tempDir,
      });

      await manager.submitInterviewAnswers({ team_id: 'team-5', answers: {} });

      const res = await manager.rejectPlan({
        team_id: 'team-5',
        reason: 'Missing security considerations',
      });

      expect(res.success).toBe(true);
      expect(res.state?.status).toBe('scoping');
      expect(res.state?.error).toBe('Missing security considerations');
    });

    it('should cancel scoping session and set status to idle and notify listeners', async () => {
      const listener = vi.fn();
      const unsubscribe = manager.onStatusUpdate(listener);

      await manager.initiateScoping({
        team_id: 'team-cancel',
        userRequest: 'Cancel scoping session',
        workspace: tempDir,
      });

      expect(manager.getState('team-cancel')?.status).toBe('scoping');

      const res = await manager.cancelScoping({ team_id: 'team-cancel' });
      expect(res.success).toBe(true);
      expect(res.state?.status).toBe('idle');
      expect(manager.getState('team-cancel')?.status).toBe('idle');

      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({
          team_id: 'team-cancel',
          state: expect.objectContaining({ status: 'idle' }),
        })
      );

      unsubscribe();
    });

    it('should handle cancelScoping gracefully when team state does not exist', async () => {
      const res = await manager.cancelScoping({ team_id: 'non-existent' });
      expect(res.success).toBe(true);
    });

    it('should trigger Auditor verification gate and advance milestones upon pass', async () => {
      await manager.initiateScoping({
        team_id: 'team-audit',
        userRequest: 'Auditor gate pipeline',
        workspace: tempDir,
      });

      await manager.submitInterviewAnswers({ team_id: 'team-audit', answers: {} });
      await manager.approvePlan({ team_id: 'team-audit' });

      // Trigger audit on milestone-1 with clean diff
      const auditRes = await manager.triggerAuditorGate({
        team_id: 'team-audit',
        milestoneId: 'milestone-1',
        diffSummary: 'Clean implementation adding domain types and interfaces.',
      });

      expect(auditRes.passed).toBe(true);
      expect(auditRes.notes).toContain('Auditor verified');

      const currentState = manager.getState('team-audit');
      expect(currentState?.plan?.milestones[0].status).toBe('verified');
      expect(currentState?.activeMilestoneId).toBe('milestone-2');
      expect(currentState?.status).toBe('executing');
    });

    it('should reject milestone and record remediation feedback when diff has mock stubs', async () => {
      await manager.initiateScoping({
        team_id: 'team-mock',
        userRequest: 'Mock stub detection',
        workspace: tempDir,
      });

      await manager.submitInterviewAnswers({ team_id: 'team-mock', answers: {} });
      await manager.approvePlan({ team_id: 'team-mock' });

      const auditRes = await manager.triggerAuditorGate({
        team_id: 'team-mock',
        milestoneId: 'milestone-1',
        diffSummary: 'const foo = () => { // TODO: implement later \n return null; }',
      });

      expect(auditRes.passed).toBe(false);
      expect(auditRes.remediation).toContain('TODO');

      const currentState = manager.getState('team-mock');
      expect(currentState?.plan?.milestones[0].status).toBe('in_progress');
      expect(currentState?.auditorFeedback).toContain('TODO');
    });
  });
});
