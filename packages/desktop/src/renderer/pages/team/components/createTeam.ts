/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TFunction } from 'i18next';
import { ipcBridge } from '@/common';
import type { TeamAssistantInput } from '@/common/adapter/teamMapper';
import type { TTeam } from '@/common/types/team/teamTypes';
import { getConversationCreateErrorMessage } from '@renderer/pages/conversation/utils/conversationCreateError';
import type { TeamAssistantOption } from './assistantSelectUtils';
import { resolveDefaultTeamAgentModel } from './teamCreateModelResolver';

/** One resolved team member: the picked assistant plus its leader flag. */
export type TeamCreateMember = {
  assistant: TeamAssistantOption;
  isLeader: boolean;
};

export type CreateTeamArgs = {
  userId: string;
  /** Final team name — callers must apply any auto-name fallback beforehand. */
  name: string;
  workspace: string;
  /**
   * Ordered members. The same assistant may appear more than once (advanced
   * modal), so models are resolved and mapped positionally, never by id.
   */
  members: TeamCreateMember[];
  t: TFunction;
};

// Both members carry `team` and `message` (optional on the opposite side) so
// callers can read either field without relying on discriminated-union
// narrowing, which this repo's tsconfig (no `strictNullChecks`) does not apply.
export type CreateTeamResult =
  | { ok: true; team: TTeam; message?: undefined }
  | { ok: false; team?: undefined; message: string };

/**
 * Shared team-create core reused by the homepage inline flow and the advanced
 * `TeamCreateModal`: resolve each member's model, assemble the agent payload,
 * call `ipcBridge.team.create`, and unwrap the platform bridge's error sentinel.
 * Never throws — failures come back as `{ ok: false, message }`.
 */
export async function createTeam({ userId, name, workspace, members, t }: CreateTeamArgs): Promise<CreateTeamResult> {
  try {
    const models = await Promise.all(
      members.map(async (member) => {
        try {
          return await resolveDefaultTeamAgentModel({
            assistant_id: member.assistant.id,
            assistant_backend: member.assistant.backend,
          });
        } catch (error) {
          throw new Error(`${member.assistant.name}: ${getConversationCreateErrorMessage(error, t)}`, {
            cause: error,
          });
        }
      })
    );
    const agents: TeamAssistantInput[] = members.map((member, index) => ({
      role: member.isLeader ? 'leader' : 'teammate',
      assistant_name: member.assistant.name,
      assistant_id: member.assistant.id,
      model: models[index],
    }));

    const team = await ipcBridge.team.create.invoke({
      user_id: userId,
      name,
      workspace,
      workspace_mode: 'shared',
      agents,
    });

    // The platform bridge swallows provider errors and returns a sentinel object.
    const result = team as unknown as { __bridgeError?: boolean; message?: string };
    if (result.__bridgeError) {
      return { ok: false, message: getConversationCreateErrorMessage(result.message ?? t('team.create.error'), t) };
    }
    return { ok: true, team };
  } catch (error) {
    return { ok: false, message: getConversationCreateErrorMessage(error, t) };
  }
}
