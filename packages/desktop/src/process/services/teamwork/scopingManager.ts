/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import type {
  ApproveTeamPlanParams,
  ApproveTeamPlanResponse,
  GetTeamScopingStateResponse,
  ITeamScopingStatusChangedEvent,
  InitiateTeamScopingParams,
  InitiateTeamScopingResponse,
  RejectTeamPlanParams,
  RejectTeamPlanResponse,
  ScopingQuestion,
  SubmitTeamInterviewAnswersParams,
  SubmitTeamInterviewAnswersResponse,
  TeamMilestone,
  TeamScopingState,
  TeamworkPlan,
} from '@/common/types/teamwork';
import { verifyMilestoneDiff } from './auditorRole';
import { knowledgeRepoService } from '../knowledgeRepo/knowledgeRepoService';

export type TeamScopingStatusListener = (event: ITeamScopingStatusChangedEvent) => void;

/**
 * Generates 3-5 structured clarifying questions for team scoping.
 */
export function generateTeamScopingQuestions(userRequest: string): ScopingQuestion[] {
  const reqLower = userRequest.toLowerCase();
  const questions: ScopingQuestion[] = [];

  // 1. Architecture Bounds
  if (
    reqLower.includes('api') ||
    reqLower.includes('backend') ||
    reqLower.includes('service') ||
    reqLower.includes('ipc')
  ) {
    questions.push({
      id: 'q_arch',
      question: 'What architectural communication pattern and backend boundary should be prioritized?',
      category: 'architecture',
      placeholder: 'e.g. Typed IPC bridge with event listeners',
      options: [
        'Typed IPC bridge with request/response and events (Recommended)',
        'REST / WebSocket endpoints with polling',
        'Direct shared in-memory state bus',
      ],
    });
  } else if (
    reqLower.includes('ui') ||
    reqLower.includes('component') ||
    reqLower.includes('view') ||
    reqLower.includes('react')
  ) {
    questions.push({
      id: 'q_arch',
      question: 'What UI component architecture and state management approach is preferred?',
      category: 'architecture',
      placeholder: 'e.g. Modular Arco Design components with React hooks',
      options: [
        'Modular React components using Arco Design with local state & hooks (Recommended)',
        'Global state store (Zustand / Redux)',
        'Custom CSS Modules with headless primitives',
      ],
    });
  } else {
    questions.push({
      id: 'q_arch',
      question: 'How should modules and responsibility boundaries be structured across team agents?',
      category: 'architecture',
      placeholder: 'e.g. Clean separation of pure business logic and side-effect adapters',
      options: [
        'Modular services with clean separation of pure logic and I/O (Recommended)',
        'Single cohesive module with explicit interfaces',
        'Extensible plugin-based pipeline',
      ],
    });
  }

  // 2. Testing Bounds (Mock vs Live)
  questions.push({
    id: 'q_testing',
    question: 'What is the required testing strategy and mock vs live verification bound?',
    category: 'testing',
    placeholder: 'e.g. Comprehensive Vitest unit tests (>=80% coverage) with mock stubs',
    options: [
      'Comprehensive Vitest unit tests covering edge cases & error paths (>=80% coverage) (Recommended)',
      'Basic public API contract & smoke tests',
      'Integration tests with mock service adapters',
    ],
  });

  // 3. Constraints & Compatibility
  questions.push({
    id: 'q_constraints',
    question: 'What constraints or compatibility requirements must be strictly enforced?',
    category: 'constraints',
    placeholder: 'e.g. Strict TypeScript (no any), full i18n support, zero bundle regressions',
    options: [
      'Strict TypeScript (no any), full i18n support, and zero bundle regressions (Recommended)',
      'Backward compatibility with existing persistent session files',
      'Zero new external npm dependencies',
    ],
  });

  // 4. Scope Boundaries & Non-Goals
  questions.push({
    id: 'q_scope',
    question: 'What items or areas are explicitly out-of-scope (non-goals) for this effort?',
    category: 'scope',
    placeholder: 'e.g. No refactoring of unrelated legacy components',
    options: [
      'No refactoring of unrelated legacy components; strictly target current feature (Recommended)',
      'Defer database schema migration changes to future release',
      'Minimal standalone prototype only',
    ],
  });

  return questions;
}

/**
 * Synthesizes the ORIGINAL_REQUEST.md document.
 */
export function synthesizeOriginalRequestDoc(
  userRequest: string,
  questions: ScopingQuestion[],
  answers: Record<string, string>,
  knowledgeRepoIds?: string[]
): string {
  const timestamp = new Date().toISOString();
  const qaSection = questions
    .map((q, idx) => {
      const ans = answers[q.id] || answers[q.question] || 'Not specified (default applied)';
      return `### Question ${idx + 1} [${q.category.toUpperCase()}]: ${q.question}\n**User Answer:** ${ans}\n`;
    })
    .join('\n');

  let repoInstructionsBlock = '';
  if (knowledgeRepoIds && knowledgeRepoIds.length > 0) {
    const built = knowledgeRepoService.buildEffectiveInstructions({
      memberName: 'Teammate',
      rolePrompt: 'Autonomous multi-agent milestone execution',
      repoIds: knowledgeRepoIds,
    });
    repoInstructionsBlock = ['', '## 5. Knowledge Repositories & Execution Playbook', built.instructions].join('\n');
  }

  return [
    '# ORIGINAL_REQUEST.md',
    '',
    `> **Generated At:** ${timestamp}`,
    '> **Framework:** Antigravity Team Mode Scoping & Verification Gate',
    '',
    '## 1. Executive Objective',
    userRequest.trim(),
    '',
    '## 2. Interactive Scoping Interview Results',
    qaSection,
    '',
    '## 3. Architectural Constraints & Non-Negotiable Bounds',
    '- **Process Boundaries:** Strict adherence to process boundary separation.',
    '- **Type Safety:** 100% strict TypeScript types; zero `any` assertions.',
    '- **Testing Requirement:** Concrete unit tests; mock implementations and stubbed shortcuts are prohibited.',
    '- **Adversarial Gate:** No milestone can be marked complete without Auditor sign-off.',
    '',
    '## 4. Scope Exclusions & Deferrals',
    '- Refactoring of unrelated legacy components is strictly out of scope.',
    repoInstructionsBlock,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Derives sequential milestones and acceptance criteria from user request and scoping answers.
 */
export function synthesizeMilestones(
  _userRequest: string,
  _questions: ScopingQuestion[],
  _answers: Record<string, string>
): TeamMilestone[] {
  return [
    {
      id: 'milestone-1',
      title: 'Milestone 1: Architectural Scoping & Type System',
      description: 'Establish shared data contracts, role definitions, and scoping engine foundations.',
      status: 'pending',
      criteria: [
        'Shared interfaces defined without type errors.',
        'Auditor role configured with non-destructive permissions.',
        'Interview questionnaire and answers validated.',
      ],
      subtasks: [
        { id: 'm1_s1', title: 'Define domain interfaces', assignedRole: 'worker', status: 'pending' },
        { id: 'm1_s2', title: 'Validate non-destructive permissions', assignedRole: 'auditor', status: 'pending' },
      ],
    },
    {
      id: 'milestone-2',
      title: 'Milestone 2: State Machine & Verification Gates',
      description: 'Implement milestone state machine, context packets, and auditor gating.',
      status: 'pending',
      criteria: [
        'State transitions: scoping -> awaiting_plan_approval -> executing -> auditing -> verified.',
        'Adversarial auditor rejects incomplete or mock diffs.',
        'Workspace markdown artifacts persisted to disk.',
      ],
      subtasks: [
        { id: 'm2_s1', title: 'Implement state machine transitions', assignedRole: 'worker', status: 'pending' },
        { id: 'm2_s2', title: 'Enforce Auditor gate on diff completion', assignedRole: 'auditor', status: 'pending' },
      ],
    },
    {
      id: 'milestone-3',
      title: 'Milestone 3: UI Panels & Chat Integration',
      description: 'Implement ScopingInterview, PlanApprovalView, and MilestoneAuditorBar.',
      status: 'pending',
      criteria: [
        'ScopingInterview allows answering questions before file edits.',
        'PlanApprovalView displays plan with edit and approve actions.',
        'MilestoneAuditorBar indicates live verification gate status.',
      ],
      subtasks: [
        { id: 'm3_s1', title: 'Build ScopingInterview & PlanApprovalView', assignedRole: 'worker', status: 'pending' },
        { id: 'm3_s2', title: 'Integrate MilestoneAuditorBar in Team view', assignedRole: 'worker', status: 'pending' },
      ],
    },
    {
      id: 'milestone-4',
      title: 'Milestone 4: Verification, Linting & Final Audit',
      description: 'Run unit test suite, verify clean typechecks, and audit final git diff.',
      status: 'pending',
      criteria: [
        'All Vitest unit tests pass with zero failures.',
        'TypeScript check passes cleanly (tsc --noEmit).',
        'Auditor signs off on all deliverables against ORIGINAL_REQUEST.md.',
      ],
      subtasks: [
        { id: 'm4_s1', title: 'Execute unit test suite', assignedRole: 'auditor', status: 'pending' },
        { id: 'm4_s2', title: 'Audit final git diff and sign off', assignedRole: 'auditor', status: 'pending' },
      ],
    },
  ];
}

/**
 * Synthesizes the PROJECT_PLAN.md document.
 */
export function synthesizeProjectPlanDoc(userRequest: string, milestones: TeamMilestone[]): string {
  const timestamp = new Date().toISOString();
  const milestonesMd = milestones
    .map((m) => {
      const subtasksMd = (m.subtasks || [])
        .map((st) => `  - [ ] **[${st.assignedRole.toUpperCase()}]** ${st.title}`)
        .join('\n');
      const criteriaMd = m.criteria.map((c) => `  - [ ] ${c}`).join('\n');

      return [
        `### ${m.title}`,
        `${m.description || ''}`,
        '',
        '**Subtasks:**',
        subtasksMd || '  - None',
        '',
        '**Auditor Acceptance Criteria:**',
        criteriaMd,
      ].join('\n');
    })
    .join('\n\n---\n\n');

  return [
    '# PROJECT_PLAN.md',
    '',
    `> **Generated At:** ${timestamp}`,
    `> **Project Scope:** ${userRequest.trim()}`,
    '> **Approval Status:** Pending User Confirmation',
    '',
    '## Overview & Milestone Hierarchy',
    'Sequential milestone breakdown with discrete subtasks and mandatory Auditor verification gates.',
    '',
    milestonesMd,
    '',
    '## Verification Gate Protocol',
    '1. Worker executes subtasks strictly within milestone scope.',
    '2. Upon subtask completion, Team Leader passes verification packet to the Auditor.',
    '3. Auditor inspects git diffs, executes test suites, and checks acceptance criteria.',
    '4. Next milestone unlocks only upon explicit Auditor PASS verdict.',
  ].join('\n');
}

/**
 * Central Team Scoping Manager for AionUi Team Mode.
 */
export class TeamScopingManager {
  private states = new Map<string, TeamScopingState>();
  private listeners = new Set<TeamScopingStatusListener>();

  onStatusUpdate(listener: TeamScopingStatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(state: TeamScopingState): void {
    state.updatedAt = Date.now();
    const event: ITeamScopingStatusChangedEvent = { team_id: state.teamId, state: { ...state } };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[TeamScopingManager] Listener error:', err);
      }
    }
    void this.persistState(state);
  }

  private async persistState(state: TeamScopingState): Promise<void> {
    if (!state.workspace) return;
    try {
      const dotDir = path.join(state.workspace, '.teamwork');
      await fs.promises.mkdir(dotDir, { recursive: true });
      const filePath = path.join(dotDir, `team_scoping_${state.teamId}.json`);
      await fs.promises.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[TeamScopingManager] Failed to persist state:', err);
    }
  }

  getState(teamId: string): TeamScopingState | undefined {
    return this.states.get(teamId);
  }

  getAllStates(): TeamScopingState[] {
    return Array.from(this.states.values());
  }

  /**
   * Phase 1: Initiate Scoping Interview for a Team.
   */
  async initiateScoping(params: InitiateTeamScopingParams): Promise<InitiateTeamScopingResponse> {
    const { team_id, userRequest, workspace = process.cwd(), knowledgeRepoIds, memberRepoMap } = params;
    const questions = generateTeamScopingQuestions(userRequest);

    const state: TeamScopingState = {
      teamId: team_id,
      userRequest,
      workspace,
      status: 'scoping',
      questions,
      answers: {},
      knowledgeRepoIds,
      memberRepoMap,
      updatedAt: Date.now(),
    };

    this.states.set(team_id, state);
    this.notify(state);

    return { success: true, state };
  }

  /**
   * Phase 1: Submit interview answers, generate ORIGINAL_REQUEST.md & PROJECT_PLAN.md.
   */
  async submitInterviewAnswers(params: SubmitTeamInterviewAnswersParams): Promise<SubmitTeamInterviewAnswersResponse> {
    const { team_id, answers } = params;
    const state = this.states.get(team_id);
    if (!state) {
      return { success: false, error: `Team scoping session for team ${team_id} not found.` };
    }

    state.answers = { ...state.answers, ...answers };
    const originalRequestDoc = synthesizeOriginalRequestDoc(
      state.userRequest,
      state.questions,
      state.answers,
      state.knowledgeRepoIds
    );
    const milestones = synthesizeMilestones(state.userRequest, state.questions, state.answers);
    const projectPlanDoc = synthesizeProjectPlanDoc(state.userRequest, milestones);

    state.originalRequestDoc = originalRequestDoc;
    state.projectPlanDoc = projectPlanDoc;
    state.plan = { specMarkdown: projectPlanDoc, milestones };
    state.status = 'awaiting_plan_approval';

    // Persist workspace artifacts to root
    if (state.workspace) {
      try {
        await fs.promises.mkdir(state.workspace, { recursive: true });
        await fs.promises.writeFile(path.join(state.workspace, 'ORIGINAL_REQUEST.md'), originalRequestDoc, 'utf-8');
        await fs.promises.writeFile(path.join(state.workspace, 'PROJECT_PLAN.md'), projectPlanDoc, 'utf-8');
      } catch (err) {
        console.warn('[TeamScopingManager] Failed writing workspace markdown docs:', err);
      }
    }

    this.notify(state);
    return {
      success: true,
      state,
      originalRequestDoc,
      projectPlanDoc,
    };
  }

  /**
   * Phase 1 to Phase 2: User approves plan -> start autonomous execution.
   */
  async approvePlan(params: ApproveTeamPlanParams): Promise<ApproveTeamPlanResponse> {
    const { team_id, planMarkdown } = params;
    const state = this.states.get(team_id);
    if (!state) {
      return { success: false, error: `Team scoping session for team ${team_id} not found.` };
    }
    if (state.status !== 'awaiting_plan_approval') {
      return { success: false, error: `Cannot approve plan while status is '${state.status}'.` };
    }

    if (planMarkdown) {
      state.projectPlanDoc = planMarkdown;
      if (state.plan) {
        state.plan.specMarkdown = planMarkdown;
      }
      if (state.workspace) {
        try {
          await fs.promises.writeFile(path.join(state.workspace, 'PROJECT_PLAN.md'), planMarkdown, 'utf-8');
        } catch (err) {
          console.warn('[TeamScopingManager] Failed updating PROJECT_PLAN.md:', err);
        }
      }
    }

    state.status = 'executing';
    if (state.plan?.milestones && state.plan.milestones.length > 0) {
      state.activeMilestoneId = state.plan.milestones[0].id;
      state.plan.milestones[0].status = 'in_progress';
    }
    state.activeRole = 'worker';

    this.notify(state);
    return { success: true, state };
  }

  /**
   * Reject plan or request revision.
   */
  async rejectPlan(params: RejectTeamPlanParams): Promise<RejectTeamPlanResponse> {
    const { team_id, reason } = params;
    const state = this.states.get(team_id);
    if (!state) {
      return { success: false, error: `Team scoping session for team ${team_id} not found.` };
    }

    state.status = 'scoping';
    state.error = reason || 'Plan rejected for revision.';
    this.notify(state);

    return { success: true, state };
  }

  /**
   * Phase 2: Trigger Adversarial Auditor Gate for an active milestone.
   */
  async triggerAuditorGate(params: {
    team_id: string;
    milestoneId?: string;
    diffSummary?: string;
    testOutput?: string;
    runner?: (command: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  }): Promise<{ passed: boolean; notes: string; remediation?: string }> {
    const { team_id, milestoneId, diffSummary, testOutput, runner } = params;
    const state = this.states.get(team_id);
    if (!state || !state.plan) {
      throw new Error(`Active plan not found for team ${team_id}`);
    }

    const targetMilestone =
      state.plan.milestones.find((m) => m.id === (milestoneId || state.activeMilestoneId)) || state.plan.milestones[0];

    targetMilestone.status = 'auditing';
    state.status = 'auditing';
    state.activeRole = 'auditor';
    this.notify(state);

    const auditResult = await verifyMilestoneDiff({
      workspace: state.workspace,
      milestone: targetMilestone,
      diffSummary,
      testOutput,
      runner,
    });

    if (auditResult.passed) {
      targetMilestone.status = 'verified';
      targetMilestone.reviewNotes = auditResult.notes;
      state.auditorFeedback = undefined;

      // Find next pending milestone
      const currentIndex = state.plan.milestones.findIndex((m) => m.id === targetMilestone.id);
      const nextMilestone = state.plan.milestones[currentIndex + 1];

      if (nextMilestone) {
        state.activeMilestoneId = nextMilestone.id;
        nextMilestone.status = 'in_progress';
        state.activeRole = 'worker';
        state.status = 'executing';
      } else {
        state.activeMilestoneId = undefined;
        state.activeRole = undefined;
        state.status = 'verified';
      }
    } else {
      targetMilestone.status = 'in_progress';
      targetMilestone.reviewNotes = auditResult.notes;
      state.auditorFeedback = auditResult.remediation || auditResult.notes;
      state.activeRole = 'worker';
      state.status = 'executing';
    }

    this.notify(state);
    return {
      passed: auditResult.passed,
      notes: auditResult.notes,
      remediation: auditResult.remediation,
    };
  }

  getScopingState(team_id: string): GetTeamScopingStateResponse {
    const state = this.states.get(team_id) || null;
    return { success: true, state };
  }
}

// Global singleton
let globalScopingManager: TeamScopingManager | null = null;

export function getTeamScopingManager(): TeamScopingManager {
  if (!globalScopingManager) {
    globalScopingManager = new TeamScopingManager();
  }
  return globalScopingManager;
}
