/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const cleanupSiderTooltipsMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null }),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobIndicator: () => <span data-testid='cron-job-indicator' />,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => null,
}));

vi.mock('@/renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: cleanupSiderTooltipsMock,
  getSiderTooltipProps: () => ({ disabled: true }),
}));

vi.mock('@arco-design/web-react', () => {
  return {
    Checkbox: ({ checked }: { checked?: boolean }) => <input type='checkbox' readOnly checked={checked} />,
    Dropdown: ({
      children,
      droplist,
      popupVisible,
    }: {
      children: React.ReactNode;
      droplist?: React.ReactNode;
      popupVisible?: boolean;
    }) => (
      <div>
        {children}
        {popupVisible ? droplist : null}
      </div>
    ),
    Menu: Object.assign(({ children }: { children?: React.ReactNode }) => <div>{children}</div>, {
      Item: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    }),
    Spin: ({ size: _size, className }: { size?: number; className?: string }) => <div className={className} />,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import type { TChatConversation } from '../../../src/common/config/storage';
import ConversationRow from '../../../src/renderer/pages/conversation/GroupedHistory/ConversationRow';
import type { ConversationRowProps } from '../../../src/renderer/pages/conversation/GroupedHistory/types';

const makeConversation = (overrides: Partial<TChatConversation> = {}): TChatConversation =>
  ({
    id: 'conversation-1',
    name: 'Channel Title',
    type: 'gemini',
    createTime: 1,
    modifyTime: 1,
    extra: {
      workspace: '/workspace',
    },
    model: {
      id: 'model-1',
      platform: 'gemini',
      name: 'Gemini',
      baseUrl: 'https://example.com',
      apiKey: 'test-key',
      useModel: 'gemini-2.5-pro',
    },
    ...overrides,
  }) as TChatConversation;

const makeProps = (overrides: Partial<ConversationRowProps> = {}): ConversationRowProps => {
  const conversation = overrides.conversation ?? makeConversation();

  return {
    conversation,
    isGenerating: false,
    hasCompletionUnread: false,
    collapsed: false,
    tooltipEnabled: false,
    batchMode: false,
    checked: false,
    selected: false,
    menuVisible: false,
    onToggleChecked: vi.fn(),
    onConversationClick: vi.fn(),
    onOpenMenu: vi.fn(),
    onMenuVisibleChange: vi.fn(),
    onEditStart: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
    onTogglePin: vi.fn(),
    getJobStatus: vi.fn(() => 'none'),
    ...overrides,
  };
};

describe('ConversationRow', () => {
  it('opens the existing conversation menu when the row is right-clicked', () => {
    cleanupSiderTooltipsMock.mockReset();
    const props = makeProps();

    render(<ConversationRow {...props} />);

    const row = screen.getByText('Channel Title').closest('.conversation-item');
    expect(row).toBeTruthy();

    fireEvent.contextMenu(row as HTMLElement);

    expect(props.onOpenMenu).toHaveBeenCalledWith(props.conversation);
    expect(props.onConversationClick).not.toHaveBeenCalled();
    expect(cleanupSiderTooltipsMock).toHaveBeenCalledTimes(1);
  });

  it('does not open the conversation menu from right-click in batch mode', () => {
    cleanupSiderTooltipsMock.mockReset();
    const props = makeProps({ batchMode: true });

    render(<ConversationRow {...props} />);

    const row = screen.getByText('Channel Title').closest('.conversation-item');
    expect(row).toBeTruthy();

    fireEvent.contextMenu(row as HTMLElement);

    expect(props.onOpenMenu).not.toHaveBeenCalled();
    expect(props.onConversationClick).not.toHaveBeenCalled();
    expect(cleanupSiderTooltipsMock).toHaveBeenCalledTimes(1);
  });
});
