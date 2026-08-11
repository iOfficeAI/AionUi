/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';

const chatConversationMocks = vi.hoisted(() => ({
  openWorkspaceInEditor: vi.fn().mockResolvedValue(undefined),
  updateConversation: vi.fn().mockResolvedValue(true),
  acpChat: vi.fn(() => null),
  codexChat: vi.fn(() => <div>codex-chat</div>),
  geminiChat: vi.fn(() => null),
  aionrsChat: vi.fn(() => null),
  acpModelSelector: vi.fn(() => <div data-testid='acp-model-selector' />),
  useGeminiModelSelection: vi.fn(() => ({})),
  useAionrsModelSelection: vi.fn(() => ({})),
  useAionrsCapabilities: vi.fn(() => ({ capabilities: null, dynamicModes: [], initialized: true })),
}));

type MockButtonProps = React.ComponentProps<'button'> & { icon?: React.ReactNode };
type MockChildrenProps = { children: React.ReactNode };
type MockMenuComponent = React.FC<MockChildrenProps> & {
  Item: React.FC<MockChildrenProps>;
};

const arcoMockComponents = vi.hoisted(() => ({
  Button: ({ children, icon, ...props }: MockButtonProps) => (
    <button type='button' {...props}>
      {icon}
      {children}
    </button>
  ),
  Dropdown: ({ children }: MockChildrenProps) => <div>{children}</div>,
  Menu: Object.assign(({ children }: MockChildrenProps) => <div>{children}</div>, {
    Item: ({ children }: MockChildrenProps) => <div>{children}</div>,
  }) as MockMenuComponent,
  Ellipsis: ({ children }: MockChildrenProps) => <span>{children}</span>,
}));

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
        invoke: chatConversationMocks.updateConversation,
      },
    },
    shell: {
      openWorkspaceInEditor: {
        invoke: chatConversationMocks.openWorkspaceInEditor,
      },
    },
  },
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
  isElectronDesktop: () => true,
  isMacOS: () => false,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  default: ({
    headerLeft,
    headerExtra,
    children,
  }: {
    headerLeft?: React.ReactNode;
    headerExtra?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      <div data-testid='header-left'>{headerLeft}</div>
      <div data-testid='header-extra'>{headerExtra}</div>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/components/ChatSider', () => ({
  default: () => <div data-testid='chat-sider' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  default: chatConversationMocks.acpChat,
}));

vi.mock('@/renderer/pages/conversation/platforms/codex/CodexChat', () => ({
  default: chatConversationMocks.codexChat,
}));

vi.mock('@/renderer/pages/conversation/platforms/nanobot/NanobotChat', () => ({
  default: () => <div>nanobot-chat</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/openclaw/OpenClawChat', () => ({
  default: () => <div>openclaw-chat</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiChat', () => ({
  default: chatConversationMocks.geminiChat,
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  default: chatConversationMocks.acpModelSelector,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiModelSelector', () => ({
  default: () => <div>gemini-model-selector</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection', () => ({
  useGeminiModelSelection: chatConversationMocks.useGeminiModelSelection,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  default: chatConversationMocks.aionrsChat,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  default: () => <div>aionrs-model-selector</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection', () => ({
  useAionrsModelSelection: chatConversationMocks.useAionrsModelSelection,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsCapabilities', () => ({
  useAionrsCapabilities: chatConversationMocks.useAionrsCapabilities,
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
  Attention: () => <span data-testid='attention-icon' />,
  CheckOne: () => <span data-testid='check-one-icon' />,
  Down: () => <span data-testid='down-icon' />,
  FolderOpen: () => <span data-testid='folder-open-icon' />,
  History: () => <span data-testid='history-icon' />,
}));

vi.mock('@arco-design/web-react', () => {
  return {
    Button: arcoMockComponents.Button,
    Dropdown: arcoMockComponents.Dropdown,
    Menu: arcoMockComponents.Menu,
    Message: {
      error: vi.fn(),
    },
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Typography: {
      Ellipsis: arcoMockComponents.Ellipsis,
    },
  };
});

const createConversation = (customWorkspace: boolean): TChatConversation =>
  ({
    id: 'conv-1',
    name: 'Workspace Chat',
    type: 'acp',
    extra: {
      workspace: 'E:/code/demo',
      customWorkspace,
      backend: 'claude',
    },
  }) as TChatConversation;

const createGeminiConversation = (sessionMode: string): TChatConversation =>
  ({
    id: 'conv-gemini',
    name: 'Gemini Chat',
    type: 'gemini',
    model: {
      id: 'provider-1',
      useModel: 'gemini-2.5-pro',
    },
    extra: {
      workspace: 'E:/code/demo',
      sessionMode,
    },
  }) as TChatConversation;

const createGeminiConversationWithModel = (sessionMode: string, useModel: string): TChatConversation =>
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
      sessionMode,
    },
  }) as TChatConversation;

const createAionrsConversation = (sessionMode: string, useModel = 'gpt-4.1'): TChatConversation =>
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
      sessionMode,
    },
  }) as TChatConversation;

const createChatgptAionrsConversation = (useModel: string): TChatConversation =>
  ({
    id: 'conv-aionrs',
    name: 'ChatGPT Aion CLI Chat',
    type: 'aionrs',
    model: {
      id: 'chatgpt-provider',
      platform: 'chatgpt',
      name: 'ChatGPT',
      baseUrl: 'https://chatgpt.com',
      apiKey: '',
      useModel,
    },
    extra: {
      workspace: 'E:/code/demo',
      sessionMode: 'auto_edit',
    },
  }) as TChatConversation;

const createCodexConversation = (sessionMode: string, currentModelId?: string): TChatConversation =>
  ({
    id: 'conv-codex',
    name: 'Codex Chat',
    type: 'codex',
    extra: {
      workspace: 'E:/code/demo',
      sessionMode,
      currentModelId,
    },
  }) as TChatConversation;

describe('ChatConversation workspace launcher', () => {
  beforeEach(() => {
    chatConversationMocks.openWorkspaceInEditor.mockClear();
    chatConversationMocks.updateConversation.mockClear();
    chatConversationMocks.acpChat.mockClear();
    chatConversationMocks.codexChat.mockClear();
    chatConversationMocks.geminiChat.mockClear();
    chatConversationMocks.aionrsChat.mockClear();
    chatConversationMocks.acpModelSelector.mockClear();
    chatConversationMocks.useGeminiModelSelection.mockReturnValue({
      providers: [{ id: 'provider-1', model: ['gemini-2.5-pro', 'glm-4.6'] }],
      getAvailableModels: (provider: { model?: string[] }) => provider.model ?? [],
    });
    chatConversationMocks.useAionrsModelSelection.mockReturnValue({
      providers: [{ id: 'provider-1', model: ['gpt-4.1', 'gpt-5.2', 'glm-4.6'] }],
      getAvailableModels: (provider: { model?: string[] }) => provider.model ?? [],
    });
    chatConversationMocks.useAionrsCapabilities.mockReturnValue({
      capabilities: null,
      dynamicModes: [],
      initialized: true,
    });
  });

  it('renders the quick-open launcher for custom workspace conversations', () => {
    render(<ChatConversation conversation={createConversation(true)} />);

    expect(screen.getByTitle('conversation.workspace.openInEditor')).toBeInTheDocument();
  });

  it('hides the quick-open launcher for non-custom workspaces', () => {
    render(<ChatConversation conversation={createConversation(false)} />);

    expect(screen.queryByTitle('conversation.workspace.openInEditor')).not.toBeInTheDocument();
  });

  it('passes the persisted Gemini session mode into the chat view', () => {
    render(<ChatConversation conversation={createGeminiConversation('yolo')} />);

    expect(chatConversationMocks.geminiChat).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-gemini',
        sessionMode: 'yolo',
      }),
      undefined
    );
  });

  it('normalizes typoed Gemini model names to the configured provider model', async () => {
    render(<ChatConversation conversation={createGeminiConversationWithModel('yolo', 'gml-4.6')} />);

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

  it('passes the persisted Aion CLI session mode into the chat view', () => {
    render(<ChatConversation conversation={createAionrsConversation('auto_edit')} />);

    expect(chatConversationMocks.aionrsChat).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-aionrs',
        sessionMode: 'auto_edit',
      }),
      undefined
    );
  });

  it('keeps the selected Aion CLI model when it matches the runtime current_model', async () => {
    chatConversationMocks.useAionrsCapabilities.mockReturnValue({
      capabilities: {
        tool_approval: true,
        thinking: false,
        effort: true,
        effort_levels: ['low', 'medium', 'high'],
        modes: ['default'],
        current_mode: 'default',
        mcp: false,
        current_model: 'gpt-4.1',
        available_models: [{ id: 'gpt-5.2', display_name: 'gpt-5.2' }],
      },
      dynamicModes: [],
      initialized: true,
    });

    render(<ChatConversation conversation={createAionrsConversation('auto_edit')} />);

    await waitFor(() => {
      expect(chatConversationMocks.aionrsChat).toHaveBeenCalled();
    });

    expect(chatConversationMocks.updateConversation).not.toHaveBeenCalled();
  });

  it('normalizes stale Aion CLI models to the runtime current_model before falling back to the list', async () => {
    chatConversationMocks.useAionrsCapabilities.mockReturnValue({
      capabilities: {
        tool_approval: true,
        thinking: false,
        effort: true,
        effort_levels: ['low', 'medium', 'high'],
        modes: ['default'],
        current_mode: 'default',
        mcp: false,
        current_model: 'gpt-5.4',
        available_models: [{ id: 'gpt-5.2', display_name: 'gpt-5.2' }],
      },
      dynamicModes: [],
      initialized: true,
    });

    render(<ChatConversation conversation={createAionrsConversation('auto_edit', 'gpt-4.1')} />);

    await waitFor(() => {
      expect(chatConversationMocks.updateConversation).toHaveBeenCalledWith({
        id: 'conv-aionrs',
        updates: {
          model: {
            id: 'provider-1',
            useModel: 'gpt-5.4',
          },
        },
      });
    });
  });

  it('normalizes typoed Aion CLI model names to the configured provider model when runtime models are unavailable', async () => {
    chatConversationMocks.useAionrsCapabilities.mockReturnValue({
      capabilities: {
        tool_approval: true,
        thinking: false,
        effort: true,
        effort_levels: ['low', 'medium', 'high'],
        modes: ['default'],
        current_mode: 'default',
        mcp: false,
        current_model: undefined,
        available_models: [],
      },
      dynamicModes: [],
      initialized: true,
    });

    render(<ChatConversation conversation={createAionrsConversation('auto_edit', 'gml-4.6')} />);

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

  it('does not downgrade configured ChatGPT models when runtime capabilities are stale', async () => {
    chatConversationMocks.useAionrsModelSelection.mockReturnValue({
      providers: [
        {
          id: 'chatgpt-provider',
          platform: 'chatgpt',
          model: ['gpt-5.6-sol', 'gpt-5.5'],
        },
      ],
      getAvailableModels: (provider: { model?: string[] }) => provider.model ?? [],
    });
    chatConversationMocks.useAionrsCapabilities.mockReturnValue({
      capabilities: {
        tool_approval: true,
        thinking: false,
        effort: true,
        effort_levels: ['low', 'medium', 'high'],
        modes: ['default'],
        current_mode: 'default',
        mcp: false,
        current_model: 'gpt-5.5',
        available_models: [
          { id: 'gpt-5.5', display_name: 'GPT-5.5' },
          { id: 'gpt-5.4', display_name: 'GPT-5.4' },
        ],
      },
      dynamicModes: [],
      initialized: true,
    });

    render(<ChatConversation conversation={createChatgptAionrsConversation('gpt-5.6-sol')} />);

    await waitFor(() => {
      expect(chatConversationMocks.aionrsChat).toHaveBeenCalled();
    });

    expect(chatConversationMocks.updateConversation).not.toHaveBeenCalled();
  });

  it('passes the persisted Codex session mode into the native Codex chat view', () => {
    render(<ChatConversation conversation={createCodexConversation('yolo')} />);

    expect(chatConversationMocks.codexChat).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-codex',
        sessionMode: 'yolo',
      }),
      undefined
    );
    expect(chatConversationMocks.acpChat).not.toHaveBeenCalled();
  });

  it('renders native Codex model selection in the header-left slot', () => {
    render(<ChatConversation conversation={createCodexConversation('yolo', 'gpt-5.5')} />);

    expect(screen.getByTestId('header-left')).toContainElement(screen.getByTestId('acp-model-selector'));
    expect(chatConversationMocks.acpModelSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-codex',
        backend: 'codex',
        initialModelId: 'gpt-5.5',
      }),
      undefined
    );
  });
});
