/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { buildGroupedHistory } from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';

const t = (key: string): string => key;

const conversation = (id: string, extra: TChatConversation['extra'], modified_at: number): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: modified_at,
    modified_at,
    extra,
  }) as TChatConversation;

describe('buildGroupedHistory', () => {
  it('keeps scheduled-task conversations in the regular conversation timeline', () => {
    const result = buildGroupedHistory(
      [conversation('cron-conversation', { backend: 'aioncore', cron_job_id: 'job-1' }, 100)],
      t
    );

    expect(result.timelineSections[0]?.items).toEqual([
      expect.objectContaining({
        type: 'conversation',
        conversation: expect.objectContaining({ id: 'cron-conversation' }),
      }),
    ]);
  });

  it('keeps scheduled-task conversations with workspaces in the project section', () => {
    const result = buildGroupedHistory(
      [
        conversation(
          'cron-project-conversation',
          {
            backend: 'aioncore',
            cron_job_id: 'job-1',
            workspace: '/repo/aionui',
            custom_workspace: true,
          },
          100
        ),
      ],
      t
    );

    expect(result.timelineSections[0]?.items).toEqual([
      expect.objectContaining({
        type: 'workspace',
        workspaceGroup: expect.objectContaining({
          workspace: '/repo/aionui',
          conversations: [expect.objectContaining({ id: 'cron-project-conversation' })],
        }),
      }),
    ]);
  });

  it('continues to hide team-owned conversations from the regular history', () => {
    const result = buildGroupedHistory(
      [conversation('team-conversation', { backend: 'aioncore', team_id: 'team-1' }, 100)],
      t
    );

    expect(result.timelineSections).toEqual([]);
  });
});
