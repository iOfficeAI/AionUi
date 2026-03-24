/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  IAgentTeamMember,
  TChatConversation,
  TProviderWithModel,
  AgentTeamDefaultView,
  AgentTeamDispatchPolicy,
} from '@/common/config/storage';
import type { AcpBackendAll } from '@/common/types/acpTypes';

export interface ICoordTimelineEntry {
  id: string;
  ts: string;
  from: string;
  role: 'system' | 'user' | 'agent';
  type: string;
  summary: string;
  body?: string;
  topic?: string;
  task_id?: string;
  /** Transport routing: all=broadcast, targets=direct, none=no wakeup */
  dispatch?: 'all' | 'targets' | 'none';
  /** Target member IDs for dispatch=targets, or ['*'] for all, or ['user'] for none */
  to?: string[];
  files?: string[];
  /** Message ID being replied to (required for consensus ACK) */
  reply_to?: string;
}

export interface IAgentTeamMemberInput {
  type: 'acp' | 'gemini';
  name: string;
  backend?: AcpBackendAll;
  cliPath?: string;
  customAgentId?: string;
  presetAssistantId?: string;
  enabledSkills?: string[];
  sessionMode?: string;
  currentModelId?: string;
  model?: TProviderWithModel;
}

export interface ICreateAgentTeamInput {
  name?: string;
  workspace?: string;
  customWorkspace?: boolean;
  dispatchPolicy?: AgentTeamDispatchPolicy;
  defaultView?: AgentTeamDefaultView;
  members: IAgentTeamMemberInput[];
  initialMessage?: string;
  initialFiles?: string[];
}

export interface IAgentTeamCreateResult {
  teamConversation: Extract<TChatConversation, { type: 'agent-team' }>;
  memberConversations: TChatConversation[];
}

export interface IAgentTeamSendMessageInput {
  conversationId: string;
  input: string;
  msgId?: string;
  files?: string[];
}

export interface IResolvedAgentTeam {
  teamConversation: Extract<TChatConversation, { type: 'agent-team' }>;
  members: IAgentTeamMember[];
}
