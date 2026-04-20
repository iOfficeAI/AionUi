import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IMessageText } from '@/common/chat/chatLib';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import MessageText from '@/renderer/pages/conversation/Messages/components/MessageText';

const mockFilePreview = vi.fn(({ path }: { path: string }) => <div data-testid='file-preview'>{path}</div>);

vi.mock('@/renderer/components/chat/CollapsibleContent', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/components/media/FilePreview', () => ({
  __esModule: true,
  default: (props: { path: string }) => mockFilePreview(props),
}));

vi.mock('@/renderer/components/media/HorizontalFileList', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/utils/chat/skillSuggestParser', () => ({
  hasSkillSuggest: () => false,
  stripSkillSuggest: (content: string) => content,
}));

vi.mock('@/renderer/utils/chat/thinkTagFilter', () => ({
  hasThinkTags: () => false,
  stripThinkTags: (content: string) => content,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => null,
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@arco-design/web-react', () => ({
  Alert: () => null,
  Message: {
    error: vi.fn(),
  },
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span data-testid='copy-icon' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

describe('MessageText attachment paths', () => {
  it('resolves relative attachment paths against the current workspace before previewing', () => {
    const message: IMessageText = {
      id: 'msg-1',
      msg_id: 'msg-1',
      conversation_id: 'conv-1',
      type: 'text',
      position: 'right',
      createdAt: Date.now(),
      content: {
        content: 'look at this\n\n[[AION_FILES]]\nuploads/photo.png',
      },
    };

    render(
      <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace/demo', type: 'acp' }}>
        <MessageText message={message} />
      </ConversationProvider>
    );

    expect(screen.getByTestId('file-preview')).toHaveTextContent('/workspace/demo/uploads/photo.png');
  });
});
