/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  BackendTeammateStatus,
  TeamAgent,
  TeammateRole,
  TeammateStatus,
  TTeam,
  WorkspaceMode,
} from '../types/team/teamTypes';

// ── Parameter types for team API calls ─────────────────────────────────

export type ICreateTeamParams = {
  user_id: string;
  name: string;
  workspace: string;
  workspace_mode: WorkspaceMode;
  agents: Omit<TeamAgent, 'slot_id' | 'conversation_id'>[];
};

export type IAddTeamAgentParams = {
  team_id: string;
  agent: Omit<TeamAgent, 'slot_id' | 'conversation_id'>;
};

// ── Backend → Frontend ─────────────────────────────────────────────────

const VALID_ROLES = new Set<TeammateRole>(['leader', 'teammate']);
const VALID_WORKSPACE_MODES = new Set<WorkspaceMode>(['shared', 'isolated']);

function toRole(raw: string | undefined): TeammateRole {
  if (raw === 'lead') return 'leader';
  return VALID_ROLES.has(raw as TeammateRole) ? (raw as TeammateRole) : 'teammate';
}

export function normalizeTeamStatus(raw: BackendTeammateStatus | undefined): TeammateStatus {
  const statusMap: Record<string, TeammateStatus> = {
    pending: 'pending',
    idle: 'idle',
    working: 'active',
    thinking: 'active',
    tool_use: 'active',
    completed: 'completed',
    error: 'failed',
  };
  return statusMap[raw ?? ''] ?? 'idle';
}

function toWorkspaceMode(raw: string | undefined): WorkspaceMode {
  return VALID_WORKSPACE_MODES.has(raw as WorkspaceMode) ? (raw as WorkspaceMode) : 'shared';
}

const NON_ACP_BACKENDS = new Set(['aionrs', 'openclaw-gateway', 'nanobot', 'remote']);

function resolveConversationType(backend: string): string {
  return NON_ACP_BACKENDS.has(backend) ? backend : 'acp';
}

export function fromBackendAgent(raw: unknown): TeamAgent {
  const r = (raw ?? {}) as Record<string, unknown>;
  const agentType = (r.agent_type as string | undefined) ?? (r.backend as string | undefined) ?? '';
  const backend = (r.backend as string | undefined) ?? agentType;
  const conversationType = resolveConversationType(backend);
  return {
    slot_id: (r.slot_id as string | undefined) ?? '',
    conversation_id: (r.conversation_id as string | undefined) ?? '',
    role: toRole(r.role as string | undefined),
    agent_type: agentType,
    icon: r.icon as string | undefined,
    agent_name: (r.agent_name as string | undefined) ?? (r.name as string | undefined) ?? '',
    conversation_type: conversationType,
    status: normalizeTeamStatus(r.status as BackendTeammateStatus | undefined),
    cli_path: r.cli_path as string | undefined,
    custom_agent_id: r.custom_agent_id as string | undefined,
    model: r.model as string | undefined,
    pending_confirmations: (r.pending_confirmations ?? r.pendingConfirmations ?? 0) as number,
  };
}

export function fromBackendTeam(raw: unknown): TTeam {
  const r = (raw ?? {}) as Record<string, unknown>;
  const agents = Array.isArray(r.agents) ? (r.agents as unknown[]).map(fromBackendAgent) : [];
  return {
    id: (r.id as string | undefined) ?? '',
    user_id: (r.user_id as string | undefined) ?? '',
    name: (r.name as string | undefined) ?? '',
    workspace: (r.workspace as string | undefined) ?? '',
    workspace_mode: toWorkspaceMode(r.workspace_mode as string | undefined),
    leader_agent_id: (r.leader_agent_id as string | undefined) ?? '',
    agents,
    session_mode: r.session_mode as string | undefined,
    created_at: (r.created_at as number | undefined) ?? 0,
    updated_at: (r.updated_at as number | undefined) ?? 0,
  };
}

export function fromBackendTeamList(raw: unknown): TTeam[] {
  return Array.isArray(raw) ? (raw as unknown[]).map(fromBackendTeam) : [];
}

export function fromBackendTeamOptional(raw: unknown): TTeam | null {
  return raw == null ? null : fromBackendTeam(raw);
}

// ── Frontend → Backend ─────────────────────────────────────────────────

export function toBackendAgent(a: Omit<TeamAgent, 'slot_id' | 'conversation_id'>): Record<string, unknown> {
  return {
    name: a.agent_name,
    role: a.role === 'leader' ? 'lead' : a.role,
    backend: a.agent_type,
    model: a.model || 'default',
    ...(a.custom_agent_id ? { custom_agent_id: a.custom_agent_id } : {}),
  };
}
