import type { TChatConversation } from '@/common/config/storage';
import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';
import CodexChat from '@/renderer/pages/conversation/platforms/codex/CodexChat';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acpChat: vi.fn(() => <div data-testid='acp-chat' />),
  codexSendBox: vi.fn(() => <div data-testid='codex-send-box' />),
  useCodexMessage: vi.fn(() => ({
    running: false,
    hasHydratedRunningState: true,
    tokenUsage: { totalTokens: 320 },
    contextLimit: 16000,
    hasStreamingContent: false,
    activity: { phase: 'waiting' },
    thought: { subject: '', description: '' },
    setThought: vi.fn(),
    resetState: vi.fn(),
  })),
}));

type MockChildrenProps = { children?: React.ReactNode };

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
      update: {
        invoke: vi.fn().mockResolvedValue(true),
      },
    },
    shell: {
      openWorkspaceInEditor: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/platforms/codex/useCodexMessage', () => ({
  useCodexMessage: mocks.useCodexMessage,
}));

vi.mock('@/renderer/pages/conversation/platforms/codex/CodexSendBox', () => ({
  default: mocks.codexSendBox,
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  default: mocks.acpChat,
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  MessageListProvider: ({ children }: MockChildrenProps) => <>{children}</>,
  useMessageLstCache: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/Messages/MessageList', () => ({
  default: () => <div data-testid='message-list' />,
}));

vi.mock('@/renderer/utils/ui/HOC', () => ({
  default:
    () =>
    <P extends object>(Component: React.ComponentType<P>) =>
      Component,
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  ConversationProvider: ({ children }: MockChildrenProps) => <>{children}</>,
}));

vi.mock('@/renderer/components/layout/FlexFullContainer', () => ({
  default: ({ children }: MockChildrenProps) => <div data-testid='flex-full'>{children}</div>,
}));

vi.mock('@/renderer/pages/conversation/components/ConversationChatConfirm', () => ({
  default: ({ children }: MockChildrenProps) => <div data-testid='confirm'>{children}</div>,
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: ({ conversationId }: { conversationId: string }) => <div>{conversationId}</div>,
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({
    info: undefined,
    isLoading: false,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => false,
  isMacOS: () => false,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  default: ({ children }: MockChildrenProps) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/conversation/components/ChatSider', () => ({
  default: () => <div data-testid='chat-sider' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/nanobot/NanobotChat', () => ({
  default: () => <div>nanobot-chat</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/openclaw/OpenClawChat', () => ({
  default: () => <div>openclaw-chat</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/remote/RemoteChat', () => ({
  default: () => <div>remote-chat</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiChat', () => ({
  default: () => <div>gemini-chat</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  default: () => <div>aionrs-chat</div>,
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  default: () => <div>acp-model-selector</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiModelSelector', () => ({
  default: () => <div>gemini-model-selector</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection', () => ({
  useGeminiModelSelection: () => ({
    providers: [],
    getAvailableModels: () => [],
  }),
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  default: () => <div>aionrs-model-selector</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection', () => ({
  useAionrsModelSelection: () => ({
    providers: [],
    getAvailableModels: () => [],
  }),
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsCapabilities', () => ({
  useAionrsCapabilities: () => ({
    capabilities: null,
    dynamicModes: [],
    initialized: true,
  }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    openPreview: vi.fn(),
  }),
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
  FolderOpen: () => <span data-testid='folder-open-icon' />,
  History: () => <span data-testid='history-icon' />,
  Down: () => <span data-testid='down-icon' />,
  Terminal: () => <span data-testid='terminal-icon' />,
  Time: () => <span data-testid='time-icon' />,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children }: MockChildrenProps) => <button type='button'>{children}</button>,
  Dropdown: ({ children }: MockChildrenProps) => <div>{children}</div>,
  Menu: Object.assign(({ children }: MockChildrenProps) => <div>{children}</div>, {
    Item: ({ children }: MockChildrenProps) => <div>{children}</div>,
  }),
  Message: {
    error: vi.fn(),
  },
  Progress: () => <div data-testid='progress' />,
  Space: ({ children }: MockChildrenProps) => <div>{children}</div>,
  Tag: ({ children }: MockChildrenProps) => <span>{children}</span>,
  Tooltip: ({ children }: MockChildrenProps) => <>{children}</>,
  Typography: {
    Ellipsis: ({ children }: MockChildrenProps) => <span>{children}</span>,
    Text: ({ children }: MockChildrenProps) => <span>{children}</span>,
  },
}));

const codexConversation = {
  id: 'conv-codex',
  name: 'Codex Chat',
  type: 'codex',
  extra: {
    workspace: '/workspace/demo',
    sessionMode: 'yolo',
  },
} as TChatConversation;

describe('CodexChat', () => {
  beforeEach(() => {
    mocks.acpChat.mockClear();
    mocks.codexSendBox.mockClear();
    mocks.useCodexMessage.mockClear();
  });

  it('renders the native Codex chat surface', () => {
    render(<CodexChat conversation_id='conv-codex' workspace='/workspace/demo' sessionMode='yolo' />);

    expect(screen.getByTestId('message-list')).toBeInTheDocument();
    expect(screen.getByTestId('codex-send-box')).toBeInTheDocument();
    expect(mocks.codexSendBox).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-codex',
        sessionMode: 'yolo',
        workspacePath: '/workspace/demo',
      }),
      undefined
    );
    expect(mocks.acpChat).not.toHaveBeenCalled();
  });

  it('routes native codex conversations through CodexChat instead of AcpChat', () => {
    render(<ChatConversation conversation={codexConversation} />);

    expect(screen.getByTestId('codex-send-box')).toBeInTheDocument();
    expect(mocks.acpChat).not.toHaveBeenCalled();
  });
});
