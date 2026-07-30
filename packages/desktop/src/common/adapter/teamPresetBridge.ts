/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TeamPreset, TeamPresetMember } from '../types/team/teamTypes';
import { httpDelete, httpGet, httpPatch, httpPost, withResponseMap } from './httpBridge';

export type CreateTeamPresetInput = Omit<TeamPreset, 'id' | 'created_at' | 'updated_at' | 'version'> & {
  members: TeamPresetMember[];
};

export type UpdateTeamPresetInput = Partial<CreateTeamPresetInput>;

export type IListTeamPresetsParams = { user_id: string };
export type ICreateTeamPresetParams = CreateTeamPresetInput;
export type IUpdateTeamPresetParams = { id: string; input: UpdateTeamPresetInput };
export type IDeleteTeamPresetParams = { id: string };

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

/**
 * Team preset CRUD adapter. Exported separately so this low-churn API can
 * evolve without adding conflicts to the main IPC compatibility bridge.
 */
export const teamPreset = {
  list: withResponseMap(
    httpGet<TeamPreset[], IListTeamPresetsParams>((p) => `/api/team-presets?user_id=${encodeURIComponent(p.user_id)}`),
    fromBackendTeamPresetList
  ),
  create: withResponseMap(
    httpPost<TeamPreset, ICreateTeamPresetParams>('/api/team-presets', toBackendCreateTeamPresetInput),
    fromBackendTeamPreset
  ),
  update: withResponseMap(
    httpPatch<TeamPreset, IUpdateTeamPresetParams>((p) => `/api/team-presets/${p.id}`, toBackendUpdateTeamPresetInput),
    fromBackendTeamPreset
  ),
  delete: httpDelete<void, IDeleteTeamPresetParams>((p) => `/api/team-presets/${p.id}`),
};
