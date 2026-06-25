import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';
import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';

const usePresetAssistantInfoMock = vi.fn();
const acpChatMock = vi.fn(() => <div data-testid='mock-acp-chat'>acp chat</div>);
const acpModelSelectorMock = vi.fn(() => <div data-testid='mock-acp-model-selector'>model selector</div>);

vi.mock('@/renderer/pages/conversation/Messages/MessageList', () => ({
  default: ({ className }: { className?: string }) => <div className={className}>message history</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  MessageListLoadingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MessageListProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MessagePaginationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMessageLstCache: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/Messages/artifacts', () => ({
  ConversationArtifactProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  default: ({ children, headerExtra }: { children: React.ReactNode; headerExtra?: React.ReactNode }) => (
    <div>
      {headerExtra}
      {children}
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  __esModule: true,
  default: (props: unknown) => acpChatMock(props),
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  __esModule: true,
  default: (props: unknown) => acpModelSelectorMock(props),
}));

vi.mock('@/renderer/pages/conversation/components/ChatSlider.tsx', () => ({
  default: () => <div>slider</div>,
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: () => <div>cron</div>,
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  resolveAssistantConfigId: () => undefined,
  usePresetAssistantInfo: (...args: unknown[]) => usePresetAssistantInfoMock(...args),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ openPreview: vi.fn() }),
}));

function legacyConversation(type: 'gemini' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote'): TChatConversation {
  return {
    id: `conv-${type}`,
    user_id: 'user-1',
    name: `${type} history`,
    type,
    model: {},
    extra: { workspace: '/tmp/aionui-history' },
    status: 'finished',
    source: 'aionui',
    created_at: 1,
    modified_at: 1,
    pinned: false,
  } as TChatConversation;
}

describe('ChatConversation legacy runtime rendering', () => {
  beforeEach(() => {
    usePresetAssistantInfoMock.mockReset();
    acpChatMock.mockClear();
    acpModelSelectorMock.mockClear();
    usePresetAssistantInfoMock.mockReturnValue({ info: undefined, isLoading: false });
  });

  it.each(['gemini', 'codex', 'openclaw-gateway', 'nanobot', 'remote'] as const)(
    'renders %s history without the old runtime chat',
    (type) => {
      render(<ChatConversation conversation={legacyConversation(type)} />);

      expect(screen.getByText('message history')).toBeInTheDocument();
      expect(screen.queryByTestId('legacy-openclaw-chat')).not.toBeInTheDocument();
      expect(screen.queryByTestId('legacy-nanobot-chat')).not.toBeInTheDocument();
      expect(screen.queryByTestId('legacy-remote-chat')).not.toBeInTheDocument();
    }
  );

  it('prefers preset assistant backend over legacy extra backend for ACP conversations', () => {
    usePresetAssistantInfoMock.mockReturnValue({
      info: {
        name: 'Research Assistant',
        logo: '📚',
        isEmoji: true,
        backend: 'codex',
        assistantId: 'assistant-research',
      },
      isLoading: false,
    });

    render(
      <ChatConversation
        conversation={
          {
            id: 'conv-acp',
            user_id: 'user-1',
            name: 'ACP history',
            type: 'acp',
            model: {},
            extra: { workspace: '/tmp/aionui-history', backend: 'claude' },
            status: 'finished',
            source: 'aionui',
            created_at: 1,
            modified_at: 1,
            pinned: false,
          } as TChatConversation
        }
      />
    );

    expect(screen.getByTestId('mock-acp-chat')).toBeInTheDocument();
    expect(acpChatMock).toHaveBeenCalled();
    expect(acpChatMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        backend: 'codex',
        assistantId: 'assistant-research',
      })
    );
  });

  it('passes the resolved assistant backend to the ACP model selector for ACP conversations', () => {
    usePresetAssistantInfoMock.mockReturnValue({
      info: {
        name: 'Research Assistant',
        logo: '📚',
        isEmoji: true,
        backend: 'codex',
        assistantId: 'assistant-research',
      },
      isLoading: false,
    });

    render(
      <ChatConversation
        conversation={
          {
            id: 'conv-acp',
            user_id: 'user-1',
            name: 'ACP history',
            type: 'acp',
            model: {},
            extra: { workspace: '/tmp/aionui-history', backend: 'claude', current_model_id: 'model-1' },
            status: 'finished',
            source: 'aionui',
            created_at: 1,
            modified_at: 1,
            pinned: false,
          } as TChatConversation
        }
      />
    );

    expect(screen.getByTestId('mock-acp-model-selector')).toBeInTheDocument();
    expect(acpModelSelectorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-acp',
        backend: 'codex',
        initialModelId: 'model-1',
        waitForWarmup: true,
      })
    );
  });
});
