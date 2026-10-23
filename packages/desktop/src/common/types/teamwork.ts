/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Teamwork Multi-Agent Orchestration Types
 * Inspired by /teamwork-preview workflow
 */

export type TeamworkPhase = 'interview' | 'scoping' | 'plan_ready' | 'executing' | 'verifying' | 'completed' | 'failed';

export type TeamworkRole = 'sentinel' | 'explorer' | 'worker' | 'auditor';

export type MilestoneStatus = 'pending' | 'in_progress' | 'review' | 'verified' | 'failed';

export type TeamworkSubtask = {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  assignedRole?: TeamworkRole;
};

export type TeamworkMilestone = {
  id: string;
  title: string;
  description: string;
  subtasks: TeamworkSubtask[];
  acceptanceCriteria: string[];
  status: MilestoneStatus;
  reviewNotes?: string;
};

export type InterviewQuestionCategory = 'architecture' | 'testing' | 'constraints' | 'scope' | 'general';

export type InterviewQuestion = {
  id: string;
  question: string;
  options?: string[];
  category: InterviewQuestionCategory;
  answer?: string;
};

/**
 * Team Mode Scoping & Verification Types
 */
export type ScopingQuestionCategory = 'architecture' | 'testing' | 'constraints' | 'scope' | 'general';

export type ScopingQuestion = {
  id: string;
  question: string;
  category: ScopingQuestionCategory;
  placeholder?: string;
  options?: string[];
  answer?: string;
};

export type TeamMilestoneStatus = 'pending' | 'in_progress' | 'auditing' | 'verified' | 'failed';

export type TeamMilestone = {
  id: string;
  title: string;
  description?: string;
  criteria: string[];
  status: TeamMilestoneStatus;
  subtasks?: Array<{ id: string; title: string; assignedRole: string; status: string }>;
  reviewNotes?: string;
};

export type TeamworkPlan = {
  specMarkdown: string;
  milestones: TeamMilestone[];
};

export type TeamScopingStatus =
  | 'idle'
  | 'scoping'
  | 'awaiting_plan_approval'
  | 'auditing'
  | 'executing'
  | 'verified'
  | 'failed';

export type TeamScopingState = {
  teamId: string;
  userRequest: string;
  workspace: string;
  status: TeamScopingStatus;
  questions: ScopingQuestion[];
  answers: Record<string, string>;
  plan?: TeamworkPlan;
  originalRequestDoc?: string;
  projectPlanDoc?: string;
  activeMilestoneId?: string;
  activeRole?: string;
  auditorFeedback?: string;
  knowledgeRepoIds?: string[];
  memberRepoMap?: Record<string, string[]>;
  error?: string;
  updatedAt: number;
};

export type TeamworkTokenConsumption = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type TeamworkAgentStatus = {
  role: TeamworkRole;
  isExecuting: boolean;
  activeToolCall?: string;
  currentSubtask?: string;
  tokenConsumption: TeamworkTokenConsumption;
  lastMessage?: string;
};

export type TeamworkSessionState = {
  sessionId: string;
  conversationId: string;
  workspace: string;
  userRequest: string;
  phase: TeamworkPhase;
  questions: InterviewQuestion[];
  answers: Record<string, string>;
  milestones: TeamworkMilestone[];
  activeMilestoneId?: string;
  activeRole?: TeamworkRole;
  activeToolCall?: string;
  agentStatuses: Record<TeamworkRole, TeamworkAgentStatus>;
  tokenConsumption: TeamworkTokenConsumption;
  originalRequestDoc?: string;
  projectPlanDoc?: string;
  knowledgeRepoIds?: string[];
  error?: string;
  createdAt: number;
  updatedAt: number;
};

export type InitiateTeamworkRequest = {
  conversationId: string;
  userRequest: string;
  workspace?: string;
  knowledgeRepoIds?: string[];
};

export type InitiateTeamworkResponse = {
  success: boolean;
  session?: TeamworkSessionState;
  error?: string;
};

export type SubmitInterviewRequest = {
  sessionId: string;
  answers: Record<string, string>;
};

export type SubmitInterviewResponse = {
  success: boolean;
  session?: TeamworkSessionState;
  originalRequestDoc?: string;
  projectPlanDoc?: string;
  error?: string;
};

export type ConfirmPlanRequest = {
  sessionId: string;
};

export type ConfirmPlanResponse = {
  success: boolean;
  session?: TeamworkSessionState;
  error?: string;
};

export type AbortTeamworkRequest = {
  sessionId: string;
  reason?: string;
};

export type AbortTeamworkResponse = {
  success: boolean;
  session?: TeamworkSessionState;
  error?: string;
};

export type GetTeamworkStateRequest = {
  sessionId?: string;
  conversationId?: string;
};

export type GetTeamworkStateResponse = {
  success: boolean;
  session?: TeamworkSessionState | null;
  error?: string;
};

export type TeamworkStatusUpdateEvent = {
  sessionId: string;
  conversationId: string;
  state: TeamworkSessionState;
};

export type TeamworkIPC = {
  initiate: (params: InitiateTeamworkRequest) => Promise<InitiateTeamworkResponse>;
  submitInterview: (params: SubmitInterviewRequest) => Promise<SubmitInterviewResponse>;
  confirmPlan: (params: ConfirmPlanRequest) => Promise<ConfirmPlanResponse>;
  abort: (params: AbortTeamworkRequest) => Promise<AbortTeamworkResponse>;
  getState: (params: GetTeamworkStateRequest) => Promise<GetTeamworkStateResponse>;
};

export type SubmitTeamInterviewAnswersParams = {
  team_id: string;
  answers: Record<string, string>;
};

export type SubmitTeamInterviewAnswersResponse = {
  success: boolean;
  state?: TeamScopingState;
  originalRequestDoc?: string;
  projectPlanDoc?: string;
  error?: string;
};

export type ApproveTeamPlanParams = {
  team_id: string;
  planMarkdown?: string;
};

export type ApproveTeamPlanResponse = {
  success: boolean;
  state?: TeamScopingState;
  error?: string;
};

export type RejectTeamPlanParams = {
  team_id: string;
  reason?: string;
};

export type RejectTeamPlanResponse = {
  success: boolean;
  state?: TeamScopingState;
  error?: string;
};

export type InitiateTeamScopingParams = {
  team_id: string;
  userRequest: string;
  workspace?: string;
  knowledgeRepoIds?: string[];
  memberRepoMap?: Record<string, string[]>;
};

export type InitiateTeamScopingResponse = {
  success: boolean;
  state?: TeamScopingState;
  error?: string;
};

export type GetTeamScopingStateParams = {
  team_id: string;
};

export type GetTeamScopingStateResponse = {
  success: boolean;
  state?: TeamScopingState | null;
  error?: string;
};

export type CancelTeamScopingParams = {
  team_id: string;
};

export type CancelTeamScopingResponse = {
  success: boolean;
  state?: TeamScopingState;
  error?: string;
};

export type ITeamScopingStatusChangedEvent = {
  team_id: string;
  state: TeamScopingState;
};
