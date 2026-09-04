/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import { useCallback, useMemo } from 'react';
import {
  normalizeMemberRecency,
  TEAM_ADD_MEMBER_RECENCY_CONFIG_KEY,
  touchMemberRecency,
  type TeamMemberRecency,
} from '../utils/teamMemberRecency';

/**
 * Persist a recency update through the shared client-preferences endpoint.
 * `configService.set` updates its reactive cache before the request completes,
 * so restore the previous cache value if the request fails (mirrors
 * `persistAssistantOrder`).
 */
async function persistMemberRecency(nextRecency: TeamMemberRecency): Promise<void> {
  const previousRecency = configService.get(TEAM_ADD_MEMBER_RECENCY_CONFIG_KEY);
  try {
    await configService.set(TEAM_ADD_MEMBER_RECENCY_CONFIG_KEY, nextRecency);
  } catch (error) {
    configService.setLocal(TEAM_ADD_MEMBER_RECENCY_CONFIG_KEY, previousRecency);
    throw error;
  }
}

/**
 * MRU ordering preference for the team "add member" candidate list. Exposes the
 * raw recency map (reactive) and a `recordUse(assistantId)` that marks an
 * assistant as just-used at the current time. Never-used assistants have no
 * entry, so they fall back to their original order.
 */
export function useTeamMemberRecency(): {
  recency: TeamMemberRecency;
  recordUse: (assistantId: string) => Promise<void>;
} {
  const [configuredRecency] = useConfig(TEAM_ADD_MEMBER_RECENCY_CONFIG_KEY);
  const recency = useMemo(() => normalizeMemberRecency(configuredRecency), [configuredRecency]);

  const recordUse = useCallback(async (assistantId: string) => {
    const nextRecency = touchMemberRecency(
      normalizeMemberRecency(configService.get(TEAM_ADD_MEMBER_RECENCY_CONFIG_KEY)),
      assistantId,
      Date.now()
    );
    await persistMemberRecency(nextRecency);
  }, []);

  return { recency, recordUse };
}
