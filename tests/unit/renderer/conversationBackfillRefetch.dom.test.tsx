/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Guards the project_id backfill path (卡点①, responsive / no-poll): opening a
 * workspace conversation lazily backfills its project_id server-side; the first
 * GET can land on the pre-backfill row (project_id null). The backend emits one
 * `conversation.listChanged` (action 'updated') when the backfill lands; the
 * conversation route must refetch on that event so the now-populated project_id
 * reaches the currentProject store (→ the Explorer host appears). No polling.
 */

import React from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import { act } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IConversationListChangedEvent } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'c1' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/renderer/pages/conversation/components/ChatConversation', () => ({
  default: () => <div data-testid='chat' />,
}));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ closePreviewIfScopeChanged: vi.fn() }),
}));
vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({ useAutoTitle: () => ({ syncTitleFromHistory: vi.fn() }) }));

// getConversationOrNull is the fetcher; sequence null-project → backfilled.
const getConversationOrNull = vi.fn<(id: string) => Promise<TChatConversation | null>>();
vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: (id: string) => getConversationOrNull(id),
}));

// Capture the listChanged listener so the test can fire the backend event.
let listChangedCb: ((e: IConversationListChangedEvent) => void) | null = null;
vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      listChanged: {
        on: (cb: (e: IConversationListChangedEvent) => void) => {
          listChangedCb = cb;
          return () => {
            listChangedCb = null;
          };
        },
      },
    },
  },
}));

import ChatConversationIndex from '@/renderer/pages/conversation/index';
import {
  getCurrentProject,
  resetCurrentProjectForTest,
} from '@/renderer/pages/conversation/explorer/currentProjectStore';

const conv = (project_id: string | null): TChatConversation =>
  ({ id: 'c1', name: 'x', type: 'acp', extra: { workspace: '/w' }, project_id }) as unknown as TChatConversation;

const renderIndex = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ChatConversationIndex />
    </SWRConfig>
  );

beforeEach(() => {
  resetCurrentProjectForTest();
  getConversationOrNull.mockReset();
  listChangedCb = null;
});
afterEach(() => cleanup());

describe('conversation project_id backfill — responsive refetch on listChanged', () => {
  it('refetches on the backfill event and publishes the populated project_id (no poll)', async () => {
    // First GET → pre-backfill (null); after the event, GET → backfilled.
    getConversationOrNull.mockResolvedValueOnce(conv(null)).mockResolvedValue(conv('p1'));
    renderIndex();

    // Initial load: workspace conv with no project_id yet → currentProject stays null.
    await waitFor(() => expect(getConversationOrNull).toHaveBeenCalledTimes(1));
    expect(getCurrentProject()).toBeNull();

    // Backend emits the one-shot backfill event for THIS conversation.
    await act(async () => {
      listChangedCb?.({ conversation_id: 'c1', action: 'updated' } as IConversationListChangedEvent);
    });

    // Refetch fires → backfilled project_id flows to the store → host would render.
    await waitFor(() => expect(getCurrentProject()).toBe('p1'));
  });

  it('ignores a listChanged event for a different conversation (no refetch)', async () => {
    getConversationOrNull.mockResolvedValue(conv(null));
    renderIndex();
    await waitFor(() => expect(getConversationOrNull).toHaveBeenCalledTimes(1));

    await act(async () => {
      listChangedCb?.({ conversation_id: 'other', action: 'updated' } as IConversationListChangedEvent);
    });

    // No extra fetch for a non-matching id; project stays null.
    await new Promise((r) => setTimeout(r, 50));
    expect(getConversationOrNull).toHaveBeenCalledTimes(1);
    expect(getCurrentProject()).toBeNull();
  });
});
