import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSendBoxDraftHook } from '@renderer/hooks/chat/useSendBoxDraft';

const mockUpdateLocalImage = vi.fn();

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  ConversationProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@renderer/components/layout/FlexFullContainer', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div data-testid='flex-full-container'>{children}</div>,
}));

vi.mock('@renderer/pages/conversation/Messages/MessageList', () => ({
  __esModule: true,
  default: ({ emptySlot }: { emptySlot?: React.ReactNode }) => <div data-testid='message-list'>{emptySlot}</div>,
}));

vi.mock('@renderer/pages/conversation/Messages/hooks', () => ({
  MessageListProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useMessageLstCache: vi.fn(),
}));

vi.mock('@renderer/utils/ui/HOC', () => ({
  __esModule: true,
  default: {
    Wrapper:
      (..._providers: unknown[]) =>
      <T,>(Component: T) =>
        Component,
  },
}));

vi.mock('@renderer/components/media/LocalImageView', () => ({
  __esModule: true,
  default: {
    Provider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    useUpdateLocalImage: () => mockUpdateLocalImage,
  },
}));

vi.mock('@/renderer/pages/conversation/components/ConversationChatConfirm', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiSendBox', () => ({
  __esModule: true,
  default: () => <div data-testid='gemini-sendbox' />,
}));

vi.mock('@renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

import GeminiChat from '@/renderer/pages/conversation/platforms/gemini/GeminiChat';
import type { GeminiModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection';
import TeamChatEmptyState from '@/renderer/pages/team/components/TeamChatEmptyState';

const useGeminiDraft = getSendBoxDraftHook('gemini', {
  _type: 'gemini',
  atPath: [],
  content: '',
  uploadFile: [],
});

const useAcpDraft = getSendBoxDraftHook('acp', {
  _type: 'acp',
  atPath: [],
  content: '',
  uploadFile: [],
});

const DraftProbe: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const geminiDraft = useGeminiDraft(conversationId).data;
  const acpDraft = useAcpDraft(conversationId).data;

  return (
    <>
      <div data-testid='gemini-draft'>{geminiDraft?.content ?? ''}</div>
      <div data-testid='acp-draft'>{acpDraft?.content ?? ''}</div>
    </>
  );
};

const modelSelection: GeminiModelSelection = {
  currentModel: undefined,
  providers: [],
  geminiModeLookup: new Map(),
  formatModelLabel: (provider, modelName) => provider?.platform ?? modelName ?? '',
  getDisplayModelName: (modelName) => modelName ?? '',
  getAvailableModels: () => [],
  handleSelectModel: vi.fn(),
};

describe('team empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the team greeting UI for Gemini team chats', () => {
    render(
      <GeminiChat
        conversation_id='conv-gemini-empty'
        workspace='/tmp/workspace'
        modelSelection={modelSelection}
        teamId='team-1'
        agentName='bob'
        agentType='gemini'
      />
    );

    expect(screen.getByText('bob')).toBeTruthy();
    expect(screen.getByText("Describe your goal and I'll get the team working on it")).toBeTruthy();
    expect(mockUpdateLocalImage).toHaveBeenCalledWith({ root: '/tmp/workspace' });
  });

  it('writes suggestion text into the Gemini draft store instead of the ACP draft store', () => {
    render(
      <>
        <TeamChatEmptyState
          conversationId='conv-gemini-draft'
          agentName='alice'
          agentType='gemini'
          draftType='gemini'
        />
        <DraftProbe conversationId='conv-gemini-draft' />
      </>
    );

    fireEvent.click(screen.getByText('Organize a debate with agents taking different sides'));

    expect(screen.getByTestId('gemini-draft').textContent).toBe('Organize a debate with agents taking different sides');
    expect(screen.getByTestId('acp-draft').textContent).toBe('');
  });
});
