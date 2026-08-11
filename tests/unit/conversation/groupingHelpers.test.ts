/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import type { SidebarItem, SidebarResponse } from '@/common/types/sidebar';
import {
  buildGroupedHistory,
  mapSidebarToGroupedHistory,
} from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';

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

const convItem = (id: string, extra: TChatConversation['extra'] = { backend: 'aioncore' }): SidebarItem => ({
  type: 'conversation',
  conversation: conversation(id, extra, 100),
});

const teamItem = (team_id: string, pinned = false): SidebarItem => ({
  type: 'team',
  team_id,
  name: team_id,
  updated_at: 0,
  pinned,
  member_conversation_ids: [],
});

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

describe('mapSidebarToGroupedHistory', () => {
  it('carries team rows in the pinned / project / chats groups in backend order', () => {
    const response: SidebarResponse = {
      has_more_groups: false,
      groups: [
        {
          scope: { type: 'pinned' },
          has_more: false,
          items: [convItem('pinned-conv'), teamItem('pinned-team', true)],
        },
        {
          scope: { type: 'project', project_id: 'p1', name: 'Project One', workspace: '/repo/one' },
          has_more: false,
          items: [teamItem('proj-team'), convItem('proj-conv', { backend: 'aioncore', workspace: '/repo/one' })],
        },
        {
          scope: { type: 'chats' },
          has_more: false,
          items: [convItem('chat-conv-a'), teamItem('chat-team'), convItem('chat-conv-b')],
        },
      ],
    };

    const result = mapSidebarToGroupedHistory(response);

    // pinned: conversation-only projection stays clean; union rows keep the team.
    expect(result.pinnedConversations.map((c) => c.id)).toEqual(['pinned-conv']);
    expect(result.pinnedRows).toEqual([
      expect.objectContaining({ type: 'conversation' }),
      expect.objectContaining({ type: 'team', team_id: 'pinned-team' }),
    ]);

    const sectionItems = result.timelineSections[0]?.items ?? [];

    // Project folder first, carrying its ordered union rows (team before conv).
    const projectItem = sectionItems.find((i) => i.type === 'workspace');
    expect(projectItem?.workspaceGroup?.conversations.map((c) => c.id)).toEqual(['proj-conv']);
    expect(projectItem?.workspaceGroup?.rows).toEqual([
      expect.objectContaining({ type: 'team', team_id: 'proj-team' }),
      expect.objectContaining({ type: 'conversation' }),
    ]);

    // Flat chats: conversation / team interleaved in backend order.
    const chatsFlat = sectionItems.filter((i) => i.type !== 'workspace');
    expect(
      chatsFlat.map((i) => (i.type === 'team' ? `team:${i.team?.team_id}` : `conv:${i.conversation?.id}`))
    ).toEqual(['conv:chat-conv-a', 'team:chat-team', 'conv:chat-conv-b']);
  });

  it('yields an empty timeline (and no rows) when the backend returns no groups', () => {
    const result = mapSidebarToGroupedHistory({ has_more_groups: false, groups: [] });

    expect(result.pinnedConversations).toEqual([]);
    expect(result.pinnedRows).toBeUndefined();
    expect(result.timelineSections).toEqual([]);
  });
});
