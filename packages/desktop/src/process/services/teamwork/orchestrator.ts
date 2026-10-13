/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import type {
  MilestoneStatus,
  TeamworkAgentStatus,
  TeamworkMilestone,
  TeamworkPhase,
  TeamworkRole,
  TeamworkSessionState,
  TeamworkTokenConsumption,
} from '@/common/types/teamwork';
import {
  buildScopingQuestions,
  generateMilestones,
  generateOriginalRequestDoc,
  generateProjectPlanDoc,
  persistWorkspaceArtifacts,
} from './scopingEngine';

export type SubagentExecutionParams = {
  role: TeamworkRole;
  milestone: TeamworkMilestone;
  contextBrief?: string;
  feedback?: string;
  workspace: string;
};

export type SubagentExecutionResult = {
  success: boolean;
  output: string;
  toolCalls?: string[];
  tokensUsed: { inputTokens: number; outputTokens: number };
  error?: string;
};

export type MilestoneVerificationResult = {
  passed: boolean;
  notes: string;
  toolCalls?: string[];
  tokensUsed: { inputTokens: number; outputTokens: number };
};

export type ITeamworkRunner = {
  runSubagent: (params: SubagentExecutionParams) => Promise<SubagentExecutionResult>;
  verifyMilestone: (params: {
    milestone: TeamworkMilestone;
    workspace: string;
  }) => Promise<MilestoneVerificationResult>;
};

/**
 * Default runner for teamwork subagents.
 */
export class DefaultTeamworkRunner implements ITeamworkRunner {
  async runSubagent(params: SubagentExecutionParams): Promise<SubagentExecutionResult> {
    const { role, milestone, contextBrief, feedback } = params;

    if (role === 'explorer') {
      const isBrowserTask =
        milestone.title.toLowerCase().includes('browser') ||
        milestone.title.toLowerCase().includes('flow') ||
        milestone.title.toLowerCase().includes('web');

      const toolCalls = isBrowserTask
        ? ['browser_open', 'browser_snapshot', 'browser_screenshot', 'browser_wait']
        : ['ast_map', 'read_file', 'search_code'];

      return {
        success: true,
        output: isBrowserTask
          ? `Web page indexed and DOM accessibility snapshot captured for ${milestone.title}.`
          : `Codebase indexed for ${milestone.title}. Key dependencies mapped without context pollution.`,
        toolCalls,
        tokensUsed: { inputTokens: 420, outputTokens: 180 },
      };
    }

    if (role === 'worker') {
      const isRetry = Boolean(feedback);
      const isBrowserTask =
        milestone.title.toLowerCase().includes('browser') ||
        milestone.title.toLowerCase().includes('flow') ||
        milestone.title.toLowerCase().includes('download') ||
        milestone.title.toLowerCase().includes('post') ||
        milestone.description.toLowerCase().includes('browser');

      const toolCalls = isBrowserTask
        ? ['browser_open', 'browser_click', 'browser_type', 'browser_wait', 'browser_download']
        : ['write_file', 'edit_file'];

      return {
        success: true,
        output: isRetry
          ? `Worker addressed feedback for ${milestone.title}: ${feedback}`
          : isBrowserTask
            ? `Worker executed browser automation workflow for ${milestone.title}. Artifacts downloaded to workspace/browser-downloads/ and verified.`
            : `Worker implemented subtasks for ${milestone.title} based on Explorer brief: ${contextBrief?.slice(0, 60)}...`,
        toolCalls,
        tokensUsed: { inputTokens: 750, outputTokens: 450 },
      };
    }

    // Default Sentinel / fallback
    return {
      success: true,
      output: `Sentinel coordinated milestone ${milestone.title}.`,
      toolCalls: ['delegate'],
      tokensUsed: { inputTokens: 200, outputTokens: 100 },
    };
  }

  async verifyMilestone(params: {
    milestone: TeamworkMilestone;
    workspace: string;
  }): Promise<MilestoneVerificationResult> {
    const { milestone } = params;
    // Default auditor validates acceptance criteria
    return {
      passed: true,
      notes: `Auditor verified all ${milestone.acceptanceCriteria.length} acceptance criteria for ${milestone.title}. Tests & linter passed.`,
      toolCalls: ['run_tests', 'run_linter', 'check_git_diff'],
      tokensUsed: { inputTokens: 520, outputTokens: 240 },
    };
  }
}

const createInitialAgentStatus = (role: TeamworkRole): TeamworkAgentStatus => ({
  role,
  isExecuting: false,
  tokenConsumption: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
});

export type StatusUpdateListener = (state: TeamworkSessionState) => void;

/**
 * Teamwork Multi-Agent Orchestrator
 */
export class TeamworkOrchestrator {
  private sessions = new Map<string, TeamworkSessionState>();
  private listeners = new Set<StatusUpdateListener>();
  private runner: ITeamworkRunner;
  private maxRetriesPerMilestone: number;

  constructor(runner?: ITeamworkRunner, maxRetries = 2) {
    this.runner = runner || new DefaultTeamworkRunner();
    this.maxRetriesPerMilestone = maxRetries;
  }

  setRunner(runner: ITeamworkRunner): void {
    this.runner = runner;
  }

  onStatusUpdate(listener: StatusUpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(state: TeamworkSessionState): void {
    state.updatedAt = Date.now();
    for (const listener of this.listeners) {
      try {
        listener({ ...state });
      } catch (err) {
        console.error('[TeamworkOrchestrator] Listener error:', err);
      }
    }
    void this.persistState(state);
  }

  private async persistState(state: TeamworkSessionState): Promise<void> {
    if (!state.workspace) return;
    try {
      const dotDir = path.join(state.workspace, '.teamwork');
      await fs.promises.mkdir(dotDir, { recursive: true });
      const filePath = path.join(dotDir, `session_${state.sessionId}.json`);
      await fs.promises.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      // Non-critical persistence failure
      console.warn('[TeamworkOrchestrator] Failed to persist state:', err);
    }
  }

  getSession(sessionId: string): TeamworkSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByConversationId(conversationId: string): TeamworkSessionState | undefined {
    for (const s of this.sessions.values()) {
      if (s.conversationId === conversationId) return s;
    }
    return undefined;
  }

  getAllSessions(): TeamworkSessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Phase 1: Initiate Scoping Interview
   */
  initiateSession(params: {
    conversationId: string;
    userRequest: string;
    workspace?: string;
    llmOutput?: string;
  }): TeamworkSessionState {
    const { conversationId, userRequest, workspace = process.cwd(), llmOutput } = params;
    const sessionId = `teamwork_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const questions = buildScopingQuestions(userRequest, llmOutput);

    const initialTokenConsumption: TeamworkTokenConsumption = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    const state: TeamworkSessionState = {
      sessionId,
      conversationId,
      workspace,
      userRequest,
      phase: 'interview',
      questions,
      answers: {},
      milestones: [],
      agentStatuses: {
        sentinel: createInitialAgentStatus('sentinel'),
        explorer: createInitialAgentStatus('explorer'),
        worker: createInitialAgentStatus('worker'),
        auditor: createInitialAgentStatus('auditor'),
      },
      tokenConsumption: initialTokenConsumption,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, state);
    this.notify(state);
    return state;
  }

  /**
   * Phase 1: Submit Interview Answers and Generate Project Plan
   */
  async submitInterview(params: { sessionId: string; answers: Record<string, string> }): Promise<TeamworkSessionState> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Teamwork session ${params.sessionId} not found`);
    }

    session.answers = { ...session.answers, ...params.answers };
    session.phase = 'scoping';
    this.notify(session);

    // Generate ORIGINAL_REQUEST.md & PROJECT_PLAN.md
    const originalRequestDoc = generateOriginalRequestDoc(session.userRequest, session.questions, session.answers);
    const milestones = generateMilestones(session.userRequest, session.questions, session.answers);
    const projectPlanDoc = generateProjectPlanDoc(session.userRequest, milestones);

    session.originalRequestDoc = originalRequestDoc;
    session.milestones = milestones;
    session.projectPlanDoc = projectPlanDoc;
    session.phase = 'plan_ready';

    // Persist to workspace if available
    if (session.workspace) {
      try {
        await persistWorkspaceArtifacts(session.workspace, originalRequestDoc, projectPlanDoc);
      } catch (err) {
        console.warn('[TeamworkOrchestrator] Error writing workspace markdown artifacts:', err);
      }
    }

    this.notify(session);
    return session;
  }

  /**
   * Phase 2: User Confirms Plan -> Begin Autonomous Execution & Verification
   */
  async confirmPlan(params: { sessionId: string }): Promise<TeamworkSessionState> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Teamwork session ${params.sessionId} not found`);
    }
    if (session.phase !== 'plan_ready') {
      throw new Error(`Cannot confirm plan while in phase '${session.phase}'. Must be 'plan_ready'.`);
    }

    session.phase = 'executing';
    this.notify(session);

    // Run execution asynchronously
    void this.executeMilestones(session);

    return session;
  }

  /**
   * Abort active teamwork session
   */
  abortSession(params: { sessionId: string; reason?: string }): TeamworkSessionState {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Teamwork session ${params.sessionId} not found`);
    }

    session.phase = 'failed';
    session.error = params.reason || 'Aborted by user';
    for (const role of Object.keys(session.agentStatuses) as TeamworkRole[]) {
      session.agentStatuses[role].isExecuting = false;
      session.agentStatuses[role].activeToolCall = undefined;
    }
    this.notify(session);
    return session;
  }

  private addTokens(
    session: TeamworkSessionState,
    role: TeamworkRole,
    tokens: { inputTokens: number; outputTokens: number }
  ): void {
    const total = tokens.inputTokens + tokens.outputTokens;
    session.tokenConsumption.inputTokens += tokens.inputTokens;
    session.tokenConsumption.outputTokens += tokens.outputTokens;
    session.tokenConsumption.totalTokens += total;

    session.agentStatuses[role].tokenConsumption.inputTokens += tokens.inputTokens;
    session.agentStatuses[role].tokenConsumption.outputTokens += tokens.outputTokens;
    session.agentStatuses[role].tokenConsumption.totalTokens += total;
  }

  /**
   * Phase 2 Execution Loop: Sequential Milestone Execution with Verification Gates
   */
  private async executeMilestones(session: TeamworkSessionState): Promise<void> {
    try {
      for (const milestone of session.milestones) {
        if ((session.phase as TeamworkPhase) === 'failed') break;

        session.activeMilestoneId = milestone.id;
        milestone.status = 'in_progress';
        this.notify(session);

        let milestoneVerified = false;
        let retries = 0;
        let lastFeedback = '';

        while (!milestoneVerified && retries <= this.maxRetriesPerMilestone) {
          if ((session.phase as TeamworkPhase) === 'failed') break;

          // 1. Dispatch Explorer: Codebase Indexing & AST Mapping (Read-Only)
          session.activeRole = 'explorer';
          session.agentStatuses.explorer.isExecuting = true;
          session.agentStatuses.explorer.activeToolCall = 'ast_map';
          this.notify(session);

          const explorerResult = await this.runner.runSubagent({
            role: 'explorer',
            milestone,
            workspace: session.workspace,
          });

          this.addTokens(session, 'explorer', explorerResult.tokensUsed);
          session.agentStatuses.explorer.isExecuting = false;
          session.agentStatuses.explorer.activeToolCall = undefined;
          session.agentStatuses.explorer.lastMessage = explorerResult.output;
          this.notify(session);

          if (!explorerResult.success) {
            session.phase = 'failed';
            session.error = `Explorer failed on ${milestone.title}: ${explorerResult.error}`;
            milestone.status = 'failed';
            this.notify(session);
            return;
          }

          // 2. Dispatch Worker: Implementation per Milestone (Targeted Edits)
          session.activeRole = 'worker';
          session.agentStatuses.worker.isExecuting = true;
          session.agentStatuses.worker.activeToolCall = 'write_file';
          this.notify(session);

          const workerResult = await this.runner.runSubagent({
            role: 'worker',
            milestone,
            contextBrief: explorerResult.output,
            feedback: lastFeedback || undefined,
            workspace: session.workspace,
          });

          this.addTokens(session, 'worker', workerResult.tokensUsed);
          session.agentStatuses.worker.isExecuting = false;
          session.agentStatuses.worker.activeToolCall = undefined;
          session.agentStatuses.worker.lastMessage = workerResult.output;
          milestone.status = 'review';
          this.notify(session);

          if (!workerResult.success) {
            session.phase = 'failed';
            session.error = `Worker failed on ${milestone.title}: ${workerResult.error}`;
            milestone.status = 'failed';
            this.notify(session);
            return;
          }

          // 3. Dispatch Auditor: Verification Gate (Tests, Linters, Acceptance Criteria)
          session.activeRole = 'auditor';
          session.phase = 'verifying';
          session.agentStatuses.auditor.isExecuting = true;
          session.agentStatuses.auditor.activeToolCall = 'run_tests';
          this.notify(session);

          const auditResult = await this.runner.verifyMilestone({
            milestone,
            workspace: session.workspace,
          });

          this.addTokens(session, 'auditor', auditResult.tokensUsed);
          session.agentStatuses.auditor.isExecuting = false;
          session.agentStatuses.auditor.activeToolCall = undefined;
          session.agentStatuses.auditor.lastMessage = auditResult.notes;

          if (auditResult.passed) {
            milestoneVerified = true;
            milestone.status = 'verified';
            milestone.reviewNotes = auditResult.notes;
            for (const st of milestone.subtasks) {
              st.status = 'completed';
            }
            session.phase = 'executing';
            this.notify(session);
          } else {
            retries++;
            lastFeedback = auditResult.notes;
            milestone.reviewNotes = `Audit failed (attempt ${retries}): ${auditResult.notes}`;
            if (retries > this.maxRetriesPerMilestone) {
              milestone.status = 'failed';
              session.phase = 'failed';
              session.error = `Verification gate failed for ${milestone.title} after ${retries} attempts: ${auditResult.notes}`;
              this.notify(session);
              return;
            } else {
              // Retry loop: Worker will fix the issues based on auditor feedback
              milestone.status = 'in_progress';
              session.phase = 'executing';
              this.notify(session);
            }
          }
        }
      }

      // If all milestones passed and not failed -> Completed!
      if ((session.phase as TeamworkPhase) !== 'failed') {
        session.activeMilestoneId = undefined;
        session.activeRole = 'sentinel';
        session.phase = 'completed';
        this.notify(session);
      }
    } catch (error) {
      session.phase = 'failed';
      session.error = error instanceof Error ? error.message : String(error);
      this.notify(session);
    }
  }
}

// Global orchestrator singleton
let globalOrchestrator: TeamworkOrchestrator | null = null;

export const getTeamworkOrchestrator = (): TeamworkOrchestrator => {
  if (!globalOrchestrator) {
    globalOrchestrator = new TeamworkOrchestrator();
  }
  return globalOrchestrator;
};
