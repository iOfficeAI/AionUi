/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';

const chatConversationMocks = vi.hoisted(() => ({
  updateConversation: vi.fn().mockResolvedValue(true),
  geminiChat: vi.fn(() => <div>gemini-chat</div>),
  aionrsChat: vi.fn(() => <div>aionrs-chat</div>),
  useGeminiModelSelection: vi.fn(() => ({})),
  useAionrsModelSelection: vi.fn(() => ({})),
}));

type MockChildrenProps = { children: React.ReactNode };

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getAssociateConversation: {
        invoke: vi.fn().mockResolvedValue([]),
      },
      get: {
        invoke: vi.fn().mockResolvedValue(null),
      },
      createWithConversation: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
      stop: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
      update: {
        invoke: chatConversationMocks.updateConversation,
      },
    },
  },
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: () => <div data-testid='cron-job-manager' />,
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({
    info: undefined,
    isLoading: false,
  }),
  resolveAssistantConfigId: () => undefined,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  default: ({ headerExtra, children }: { headerExtra?: React.ReactNode; children: React.ReactNode }) => (
    <div>
      <div data-testid='header-extra'>{headerExtra}</div>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/components/ChatSider', () => ({
  default: () => <div data-testid='chat-sider' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiChat', () => ({
  default: chatConversationMocks.geminiChat,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  default: chatConversationMocks.aionrsChat,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiModelSelector', () => ({
  default: () => <div>gemini-model-selector</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  default: () => <div>aionrs-model-selector</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection', () => ({
  useGeminiModelSelection: chatConversationMocks.useGeminiModelSelection,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection', () => ({
  useAionrsModelSelection: chatConversationMocks.useAionrsModelSelection,
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    openPreview: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/components/ConversationSkillsIndicator', () => ({
  default: () => <div data-testid='skills-indicator' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/openclaw/StarOfficeMonitorCard.tsx', () => ({
  default: () => <div>star-office-monitor</div>,
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('swr', () => ({
  default: () => ({
    data: [],
  }),
}));

vi.mock('@icon-park/react', () => ({
  Attention: () => <span data-testid='attention-icon' />,
  CheckOne: () => <span data-testid='check-one-icon' />,
  History: () => <span data-testid='history-icon' />,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children }: MockChildrenProps) => <button type='button'>{children}</button>,
  Dropdown: ({ children }: MockChildrenProps) => <div>{children}</div>,
  Menu: Object.assign(({ children }: MockChildrenProps) => <div>{children}</div>, {
    Item: ({ children }: MockChildrenProps) => <div>{children}</div>,
  }),
  Tooltip: ({ children }: MockChildrenProps) => <>{children}</>,
  Typography: {
    Ellipsis: ({ children }: MockChildrenProps) => <span>{children}</span>,
  },
}));

const createGeminiConversation = (useModel: string): TChatConversation =>
  ({
    id: 'conv-gemini',
    name: 'Gemini Chat',
    type: 'gemini',
    model: {
      id: 'provider-1',
      useModel,
    },
    extra: {
      workspace: 'E:/code/demo',
    },
  }) as TChatConversation;

const createAionrsConversation = (useModel: string): TChatConversation =>
  ({
    id: 'conv-aionrs',
    name: 'Aion CLI Chat',
    type: 'aionrs',
    model: {
      id: 'provider-1',
      useModel,
    },
    extra: {
      workspace: 'E:/code/demo',
    },
  }) as TChatConversation;

describe('ChatConversation model normalization', () => {
  beforeEach(() => {
    chatConversationMocks.updateConversation.mockClear();
    chatConversationMocks.geminiChat.mockClear();
    chatConversationMocks.aionrsChat.mockClear();
    chatConversationMocks.useGeminiModelSelection.mockReturnValue({
      providers: [{ id: 'provider-1', model: ['gemini-2.5-pro', 'glm-4.6'] }],
      getAvailableModels: (provider: { model?: string[] }) => provider.model ?? [],
    });
    chatConversationMocks.useAionrsModelSelection.mockReturnValue({
      providers: [{ id: 'provider-1', model: ['gpt-4.1', 'glm-4.6'] }],
      getAvailableModels: (provider: { model?: string[] }) => provider.model ?? [],
    });
  });

  it('normalizes typoed Gemini model names to the configured provider model', async () => {
    render(<ChatConversation conversation={createGeminiConversation('gml-4.6')} />);

    await waitFor(() => {
      expect(chatConversationMocks.updateConversation).toHaveBeenCalledWith({
        id: 'conv-gemini',
        updates: {
          model: {
            id: 'provider-1',
            useModel: 'glm-4.6',
          },
        },
      });
    });
  });

  it('normalizes typoed Aion CLI model names to the configured provider model', async () => {
    render(<ChatConversation conversation={createAionrsConversation('gml-4.6')} />);

    await waitFor(() => {
      expect(chatConversationMocks.updateConversation).toHaveBeenCalledWith({
        id: 'conv-aionrs',
        updates: {
          model: {
            id: 'provider-1',
            useModel: 'glm-4.6',
          },
        },
      });
    });
  });
});
