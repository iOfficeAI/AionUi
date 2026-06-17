/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  BackendTeammateStatus,
  TeamAssistant,
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
  assistants: Omit<TeamAssistant, 'slot_id' | 'conversation_id'>[];
};

export type IAddTeamAssistantParams = {
  team_id: string;
  assistant: Omit<TeamAssistant, 'slot_id' | 'conversation_id'>;
};

/** @deprecated Use IAddTeamAssistantParams. */
export type IAddTeamAgentParams = IAddTeamAssistantParams;

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

function resolveAssistantIdentity(raw: Record<string, unknown>): string | undefined {
  return (raw.assistant_id as string | undefined) ?? (raw.custom_agent_id as string | undefined);
}

export function fromBackendAssistant(raw: unknown): TeamAssistant {
  const r = (raw ?? {}) as Record<string, unknown>;
  const agentType = (r.agent_type as string | undefined) ?? (r.backend as string | undefined) ?? '';
  const backend = (r.backend as string | undefined) ?? agentType;
  const conversationType = resolveConversationType(backend);
  return {
    slot_id: (r.slot_id as string | undefined) ?? '',
    conversation_id: (r.conversation_id as string | undefined) ?? '',
    role: toRole(r.role as string | undefined),
    assistant_backend: backend,
    icon: r.icon as string | undefined,
    assistant_name: (r.agent_name as string | undefined) ?? (r.name as string | undefined) ?? '',
    conversation_type: conversationType,
    status: normalizeTeamStatus(r.status as BackendTeammateStatus | undefined),
    cli_path: r.cli_path as string | undefined,
    // New payloads write `assistant_id`; `custom_agent_id` is read-only legacy compatibility.
    assistant_id: resolveAssistantIdentity(r),
    model: r.model as string | undefined,
    pending_confirmations: (r.pending_confirmations ?? r.pendingConfirmations ?? 0) as number,
  };
}

/** @deprecated Use fromBackendAssistant. */
export const fromBackendAgent = fromBackendAssistant;

export function fromBackendTeam(raw: unknown): TTeam {
  const r = (raw ?? {}) as Record<string, unknown>;
  const assistants = Array.isArray(r.agents) ? (r.agents as unknown[]).map(fromBackendAssistant) : [];
  return {
    id: (r.id as string | undefined) ?? '',
    user_id: (r.user_id as string | undefined) ?? '',
    name: (r.name as string | undefined) ?? '',
    workspace: (r.workspace as string | undefined) ?? '',
    workspace_mode: toWorkspaceMode(r.workspace_mode as string | undefined),
    leader_agent_id: (r.leader_agent_id as string | undefined) ?? '',
    assistants,
    agents: assistants,
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

export function toBackendAssistant(a: Omit<TeamAssistant, 'slot_id' | 'conversation_id'>): Record<string, unknown> {
  if (!a.assistant_id) {
    throw new Error('assistant_id is required');
  }

  return {
    name: a.assistant_name,
    role: a.role === 'leader' ? 'lead' : a.role,
    model: a.model || 'default',
    assistant_id: a.assistant_id,
  };
}

/** @deprecated Use toBackendAssistant. */
export const toBackendAgent = toBackendAssistant;
