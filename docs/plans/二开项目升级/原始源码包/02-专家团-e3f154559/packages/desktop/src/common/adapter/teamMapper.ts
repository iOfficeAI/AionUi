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

/**
 * Fields the backend actually consumes when creating a team member. The
 * runtime backend / conversation type are derived server-side from the
 * assistant, so callers only supply assistant identity, role, and model.
 */
export type TeamAssistantInput = Pick<TeamAssistant, 'role' | 'assistant_name' | 'assistant_id' | 'model'>;

export type ICreateTeamParams = {
  user_id: string;
  name: string;
  workspace: string;
  workspace_mode: WorkspaceMode;
  agents: TeamAssistantInput[];
};

export type IAddTeamAssistantParams = {
  team_id: string;
  assistant: TeamAssistantInput;
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
    // Dormant (leader-only warmup): pass through so the badge can render an
    // asleep state distinct from idle, instead of collapsing to idle.
    dormant: 'dormant',
  };
  return statusMap[raw ?? ''] ?? 'idle';
}

function toWorkspaceMode(raw: string | undefined): WorkspaceMode {
  return VALID_WORKSPACE_MODES.has(raw as WorkspaceMode) ? (raw as WorkspaceMode) : 'shared';
}

export function fromBackendAssistant(raw: unknown): TeamAssistant {
  const r = (raw ?? {}) as Record<string, unknown>;
  const agentType = (r.agent_type as string | undefined) ?? (r.backend as string | undefined) ?? '';
  const backend = (r.assistant_backend as string | undefined) ?? (r.backend as string | undefined) ?? agentType;
  return {
    slot_id: (r.slot_id as string | undefined) ?? '',
    conversation_id: (r.conversation_id as string | undefined) ?? '',
    role: toRole(r.role as string | undefined),
    assistant_backend: backend,
    icon: r.icon as string | undefined,
    assistant_name:
      (r.assistant_name as string | undefined) ??
      (r.agent_name as string | undefined) ??
      (r.name as string | undefined) ??
      '',
    status: normalizeTeamStatus(r.status as BackendTeammateStatus | undefined),
    cli_path: r.cli_path as string | undefined,
    assistant_id: r.assistant_id as string | undefined,
    model: r.model as string | undefined,
    pending_confirmations: (r.pending_confirmations ?? r.pendingConfirmations ?? 0) as number,
  };
}

export function fromBackendTeam(raw: unknown): TTeam {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawAssistants = Array.isArray(r.assistants)
    ? (r.assistants as unknown[])
    : Array.isArray(r.agents)
      ? (r.agents as unknown[])
      : [];
  const assistants = rawAssistants.map(fromBackendAssistant);
  const leaderAssistantId =
    (r.leader_assistant_id as string | undefined) ?? (r.leader_agent_id as string | undefined) ?? '';
  return {
    id: (r.id as string | undefined) ?? '',
    user_id: (r.user_id as string | undefined) ?? '',
    name: (r.name as string | undefined) ?? '',
    workspace: (r.workspace as string | undefined) ?? '',
    workspace_mode: toWorkspaceMode(r.workspace_mode as string | undefined),
    leader_assistant_id: leaderAssistantId,
    assistants,
    leader_agent_id: leaderAssistantId,
    agents: assistants,
    session_mode: r.session_mode as string | undefined,
    origin_conversation_id: r.origin_conversation_id as string | undefined,
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

import type {
  IAdHocTeamByConversationParams,
  IAdHocTeamFromConversationParams,
  TAdHocTeamAssociation,
  TAdHocTeamCreateResult,
} from '../types/team/adHocTeamTypes';

// ── Ad-hoc team (from conversation) ──────────────────────────────────────

export function toBackendAdHocTeamFromConversationParams(p: IAdHocTeamFromConversationParams): Record<string, unknown> {
  return {
    conversation_id: p.conversation_id,
    user_id: p.user_id,
    target_assistant_id: p.target_assistant_id,
    ...(p.name ? { name: p.name } : {}),
    ...(p.workspace_mode ? { workspace_mode: p.workspace_mode } : {}),
  };
}

export function fromBackendAdHocTeamCreateResult(raw: unknown): TAdHocTeamCreateResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    team_id: (r.team_id as string | undefined) ?? '',
    origin_conversation_id: (r.origin_conversation_id as string | undefined) ?? '',
    leader_slot_id: (r.leader_slot_id as string | undefined) ?? '',
    target_slot_id: (r.target_slot_id as string | undefined) ?? '',
    created: Boolean(r.created),
  };
}

export function fromBackendAdHocTeamAssociationOptional(raw: unknown): TAdHocTeamAssociation | null {
  if (raw == null) return null;
  const r = (raw ?? {}) as Record<string, unknown>;
  const team = r.team ? fromBackendTeam(r.team) : undefined;
  const status = (r.status as string | undefined) ?? 'active';
  return {
    team_id: (r.team_id as string | undefined) ?? '',
    origin_conversation_id: (r.origin_conversation_id as string | undefined) ?? '',
    status: status === 'active' || status === 'disbanded' ? status : 'active',
    ...(team ? { team } : {}),
  };
}

// ── Frontend → Backend ─────────────────────────────────────────────────

export function toBackendAssistant(a: TeamAssistantInput): Record<string, unknown> {
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

import type { TeamPreset, TeamPresetMember } from '../types/team/teamTypes';

// ── Team preset parameter types ──────────────────────────────────────────

export type CreateTeamPresetInput = Omit<TeamPreset, 'id' | 'created_at' | 'updated_at' | 'version'> & {
  members: TeamPresetMember[];
};

export type UpdateTeamPresetInput = Partial<CreateTeamPresetInput>;

export type IListTeamPresetsParams = { user_id: string };
export type ICreateTeamPresetParams = CreateTeamPresetInput;
export type IUpdateTeamPresetParams = { id: string; input: UpdateTeamPresetInput };
export type IDeleteTeamPresetParams = { id: string };

// ── Team preset Backend → Frontend ───────────────────────────────────────

export function fromBackendTeamPresetMember(raw: unknown): TeamPresetMember {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    assistant_backend: (r.assistant_backend as string | undefined) ?? (r.backend as string | undefined) ?? '',
    assistant_id: r.assistant_id as string | undefined,
    model: r.model as string | undefined,
    assistant_name: (r.assistant_name as string | undefined) ?? (r.name as string | undefined) ?? '',
    role: (r.role as string | undefined) ?? '',
    order: (r.order as number | undefined) ?? 0,
  };
}

export function fromBackendTeamPreset(raw: unknown): TeamPreset {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawMembers = Array.isArray(r.members) ? (r.members as unknown[]) : [];
  const createdAt = r.created_at as number | undefined;
  const updatedAt = r.updated_at as number | undefined;
  return {
    id: (r.id as string | undefined) ?? '',
    user_id: (r.user_id as string | undefined) ?? '',
    name: (r.name as string | undefined) ?? '',
    icon: r.icon as string | undefined,
    category: r.category as string | undefined,
    description: (r.description as string | undefined) ?? '',
    expertise_tags: Array.isArray(r.expertise_tags) ? (r.expertise_tags as string[]) : [],
    example_prompts: Array.isArray(r.example_prompts) ? (r.example_prompts as string[]) : [],
    leader: fromBackendTeamPresetMember(r.leader),
    members: rawMembers.map(fromBackendTeamPresetMember),
    version: (r.version as number | undefined) ?? 1,
    created_at: createdAt != null ? new Date(createdAt).toISOString() : new Date().toISOString(),
    updated_at: updatedAt != null ? new Date(updatedAt).toISOString() : new Date().toISOString(),
  };
}

export function fromBackendTeamPresetList(raw: unknown): TeamPreset[] {
  return Array.isArray(raw) ? (raw as unknown[]).map(fromBackendTeamPreset) : [];
}

// ── Team preset Frontend → Backend ───────────────────────────────────────

function toBackendTeamPresetMember(member: TeamPresetMember): Record<string, unknown> {
  return {
    assistant_backend: member.assistant_backend,
    ...(member.assistant_id != null ? { assistant_id: member.assistant_id } : {}),
    ...(member.model != null ? { model: member.model } : {}),
    assistant_name: member.assistant_name,
    role: member.role,
    order: member.order,
  };
}

export function toBackendCreateTeamPresetInput(input: CreateTeamPresetInput): Record<string, unknown> {
  return {
    name: input.name,
    ...(input.icon != null ? { icon: input.icon } : {}),
    ...(input.category != null ? { category: input.category } : {}),
    description: input.description,
    expertise_tags: input.expertise_tags,
    example_prompts: input.example_prompts,
    leader: toBackendTeamPresetMember(input.leader),
    members: input.members.map(toBackendTeamPresetMember),
  };
}

export function toBackendUpdateTeamPresetInput(params: IUpdateTeamPresetParams): Record<string, unknown> {
  const { input } = params;
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.icon !== undefined) body.icon = input.icon;
  if (input.category !== undefined) body.category = input.category;
  if (input.description !== undefined) body.description = input.description;
  if (input.expertise_tags !== undefined) body.expertise_tags = input.expertise_tags;
  if (input.example_prompts !== undefined) body.example_prompts = input.example_prompts;
  if (input.leader !== undefined) body.leader = toBackendTeamPresetMember(input.leader);
  if (input.members !== undefined) body.members = input.members.map(toBackendTeamPresetMember);
  return body;
}
