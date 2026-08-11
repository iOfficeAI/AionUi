/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '../../../src/common/config/storage';
import type { TimelineSection, WorkspaceGroup } from '../../../src/renderer/pages/conversation/GroupedHistory/types';
import { buildVisibleConversationIds } from '../../../src/renderer/pages/conversation/GroupedHistory/utils/visibleConversationOrder';

const createConversation = (id: string): TChatConversation => ({
  createTime: 1,
  modifyTime: 1,
  name: `Conversation ${id}`,
  id,
  type: 'gemini',
  extra: {
    workspace: `/workspace/${id}`,
    customWorkspace: true,
  },
  model: {
    id: 'model-1',
    name: 'Gemini',
    useModel: 'gemini-2.0-flash',
    platform: 'gemini',
    baseUrl: '',
    apiKey: '',
  } as TChatConversation['model'],
});

const createWorkspaceGroup = (workspace: string, conversationIds: string[]): WorkspaceGroup => ({
  workspace,
  displayName: workspace,
  conversations: conversationIds.map((conversationId) => createConversation(conversationId)),
});

describe('buildVisibleConversationIds', () => {
  it('keeps pinned conversations first and preserves rendered section order', () => {
    const timelineSections: TimelineSection[] = [
      {
        timeline: 'Today',
        items: [
          {
            type: 'conversation',
            time: 3,
            conversation: createConversation('direct-1'),
          },
          {
            type: 'workspace',
            time: 2,
            workspaceGroup: createWorkspaceGroup('/workspace/project-a', ['ws-1', 'ws-2']),
          },
          {
            type: 'conversation',
            time: 1,
            conversation: createConversation('direct-2'),
          },
        ],
      },
    ];

    const visibleConversationIds = buildVisibleConversationIds({
      pinnedConversations: [createConversation('pinned-1'), createConversation('pinned-2')],
      timelineSections,
      expandedWorkspaces: ['/workspace/project-a'],
      siderCollapsed: false,
    });

    expect(visibleConversationIds).toEqual(['pinned-1', 'pinned-2', 'direct-1', 'ws-1', 'ws-2', 'direct-2']);
  });

  it('skips conversations inside collapsed workspace groups', () => {
    const visibleConversationIds = buildVisibleConversationIds({
      pinnedConversations: [],
      timelineSections: [
        {
          timeline: 'Today',
          items: [
            {
              type: 'workspace',
              time: 1,
              workspaceGroup: createWorkspaceGroup('/workspace/project-a', ['ws-1', 'ws-2']),
            },
          ],
        },
      ],
      expandedWorkspaces: [],
      siderCollapsed: false,
    });

    expect(visibleConversationIds).toEqual([]);
  });

  it('includes workspace conversations when the sidebar is collapsed', () => {
    const visibleConversationIds = buildVisibleConversationIds({
      pinnedConversations: [],
      timelineSections: [
        {
          timeline: 'Today',
          items: [
            {
              type: 'workspace',
              time: 1,
              workspaceGroup: createWorkspaceGroup('/workspace/project-a', ['ws-1', 'ws-2']),
            },
          ],
        },
      ],
      expandedWorkspaces: [],
      siderCollapsed: true,
    });

    expect(visibleConversationIds).toEqual(['ws-1', 'ws-2']);
  });
});
