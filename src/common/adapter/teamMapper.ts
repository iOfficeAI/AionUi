/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TeamAgent, TeammateRole, TeammateStatus, TTeam, WorkspaceMode } from '../types/teamTypes';

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
const VALID_STATUSES = new Set<TeammateStatus>(['pending', 'idle', 'active', 'completed', 'failed']);
const VALID_WORKSPACE_MODES = new Set<WorkspaceMode>(['shared', 'isolated']);

function toRole(raw: string | undefined): TeammateRole {
  if (raw === 'lead') return 'leader';
  return VALID_ROLES.has(raw as TeammateRole) ? (raw as TeammateRole) : 'teammate';
}

function toStatus(raw: string | undefined): TeammateStatus {
  return VALID_STATUSES.has(raw as TeammateStatus) ? (raw as TeammateStatus) : 'idle';
}

function toWorkspaceMode(raw: string | undefined): WorkspaceMode {
  return VALID_WORKSPACE_MODES.has(raw as WorkspaceMode) ? (raw as WorkspaceMode) : 'shared';
}

export function fromBackendAgent(raw: unknown): TeamAgent {
  const r = (raw ?? {}) as Record<string, unknown>;
  const agentType = (r.agent_type as string | undefined) ?? (r.backend as string | undefined) ?? '';
  const backend = (r.backend as string | undefined) ?? agentType;
  // codex and acp backends both use the 'acp' conversation type
  const conversationType = backend === 'codex' || backend === 'acp' ? 'acp' : backend;
  return {
    slot_id: (r.slot_id as string | undefined) ?? '',
    conversation_id: (r.conversation_id as string | undefined) ?? '',
    role: toRole(r.role as string | undefined),
    agent_type: agentType,
    agent_name: (r.agent_name as string | undefined) ?? (r.name as string | undefined) ?? '',
    conversation_type: conversationType,
    status: toStatus(r.status as string | undefined),
    cli_path: r.cli_path as string | undefined,
    custom_agent_id: r.custom_agent_id as string | undefined,
    model: r.model as string | undefined,
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
