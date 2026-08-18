/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  IAdHocTeamByConversationParams,
  IAdHocTeamFromConversationParams,
  TAdHocTeamAssociation,
  TAdHocTeamCreateResult,
} from '../types/team/adHocTeamTypes';
import { httpGet, httpPost, withResponseMap } from './httpBridge';
import { fromBackendTeam } from './teamMapper';

// ── Ad-hoc team (from conversation) mappers ─────────────────────────────

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
    ...(typeof r.target_slot_id === 'string' ? { target_slot_id: r.target_slot_id } : {}),
    created: Boolean(r.created),
  };
}

export function fromBackendAdHocTeamAssociationOptional(raw: unknown): TAdHocTeamAssociation | null {
  if (raw == null) return null;
  const r = (raw ?? {}) as Record<string, unknown>;
  const teamId = typeof r.team_id === 'string' ? r.team_id.trim() : '';
  if (!teamId) return null;
  const team = r.team ? fromBackendTeam(r.team) : undefined;
  const status = (r.status as string | undefined) ?? 'active';
  return {
    team_id: teamId,
    origin_conversation_id: (r.origin_conversation_id as string | undefined) ?? '',
    status: status === 'active' || status === 'disbanded' ? status : 'active',
    ...(team ? { team } : {}),
  };
}

/**
 * Ad-hoc team endpoints (create team from an ordinary conversation / look up
 * the association). Kept out of the main IPC compatibility bridge so the
 * ad-hoc surface evolves without adding conflicts to `team` core routes.
 * Re-exported through `team.fromConversation` / `team.getByConversation` in
 * ipcBridge to keep the consumer API stable.
 */
export const adHocTeam = {
  fromConversation: withResponseMap(
    httpPost<TAdHocTeamCreateResult, IAdHocTeamFromConversationParams>(
      '/api/teams/from-conversation',
      toBackendAdHocTeamFromConversationParams
    ),
    fromBackendAdHocTeamCreateResult
  ),
  getByConversation: withResponseMap(
    httpGet<TAdHocTeamAssociation | null, IAdHocTeamByConversationParams>(
      (p) =>
        `/api/teams/by-conversation?conversation_id=${encodeURIComponent(p.conversation_id)}&user_id=${encodeURIComponent(p.user_id)}`
    ),
    fromBackendAdHocTeamAssociationOptional
  ),
};
