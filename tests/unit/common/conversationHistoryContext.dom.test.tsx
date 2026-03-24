/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '../../../src/common/config/storage';
import { ConversationHistoryProvider } from '../../../src/renderer/hooks/context/ConversationHistoryContext';
import { LayoutContext } from '../../../src/renderer/hooks/context/LayoutContext';
import { useConversations } from '../../../src/renderer/pages/conversation/GroupedHistory/hooks/useConversations';
import { useVisibleConversationIds } from '../../../src/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds';
import type { GroupedHistoryResult } from '../../../src/renderer/pages/conversation/GroupedHistory/types';
import { useConversationListSync } from '../../../src/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import { buildGroupedHistory } from '../../../src/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({}),
}));

vi.mock('../../../src/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync', () => ({
  useConversationListSync: vi.fn(),
}));

vi.mock('../../../src/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers', () => ({
  buildGroupedHistory: vi.fn(),
}));

const mockedUseConversationListSync = vi.mocked(useConversationListSync);
const mockedBuildGroupedHistory = vi.mocked(buildGroupedHistory);

const createConversation = (id: string): TChatConversation => ({
  createTime: 1,
  modifyTime: 1,
  name: `Conversation ${id}`,
  id,
  type: 'gemini',
  extra: {},
  model: {
    id: 'model-1',
    name: 'Gemini',
    useModel: 'gemini-2.0-flash',
    platform: 'gemini',
    baseUrl: '',
    apiKey: '',
  } as TChatConversation['model'],
});

const groupedHistory: GroupedHistoryResult = {
  pinnedConversations: [createConversation('pinned-1')],
  timelineSections: [],
};

const createWrapper = (): React.FC<React.PropsWithChildren> => {
  return ({ children }) => (
    <LayoutContext.Provider
      value={{
        isMobile: false,
        siderCollapsed: false,
        setSiderCollapsed: vi.fn(),
      }}
    >
      <ConversationHistoryProvider>{children}</ConversationHistoryProvider>
    </LayoutContext.Provider>
  );
};

describe('ConversationHistoryProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedBuildGroupedHistory.mockReset();
    mockedUseConversationListSync.mockReset();
    mockedBuildGroupedHistory.mockReturnValue(groupedHistory);
    mockedUseConversationListSync.mockReturnValue({
      conversations: [createConversation('visible-1')],
      isConversationGenerating: () => false,
      hasCompletionUnread: () => false,
      clearCompletionUnread: () => {},
      setActiveConversation: () => {},
    });
  });

  it('computes grouped history once for shared sidebar consumers', () => {
    renderHook(
      () => {
        useConversations();
        useVisibleConversationIds();
      },
      {
        wrapper: createWrapper(),
      }
    );

    expect(mockedBuildGroupedHistory).toHaveBeenCalledTimes(1);
  });
});
