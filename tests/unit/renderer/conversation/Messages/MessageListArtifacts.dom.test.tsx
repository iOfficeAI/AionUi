import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import MessageList from '@/renderer/pages/conversation/Messages/MessageList';
import { ConversationArtifactProvider } from '@/renderer/pages/conversation/Messages/artifacts';

const mockListArtifactsInvoke = vi.fn();
const mockArtifactStreamOn = vi.fn(() => () => {});

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      listArtifacts: {
        invoke: (...args: unknown[]) => mockListArtifactsInvoke(...args),
      },
      artifactStream: {
        on: (...args: unknown[]) => mockArtifactStreamOn(...args),
      },
    },
  },
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({ conversation_id: 'conv-legacy' }),
}));

vi.mock('@/renderer/hooks/file/useAutoPreviewOfficeFiles', () => ({
  useAutoPreviewOfficeFiles: () => {},
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', async () => ({
  ...(await vi.importActual<typeof import('@/renderer/pages/conversation/Messages/hooks')>(
    '@/renderer/pages/conversation/Messages/hooks'
  )),
  useMessageList: () => [],
}));

vi.mock('@/renderer/pages/conversation/Messages/useAutoScroll', () => ({
  useAutoScroll: () => ({
    virtuosoRef: { current: null },
    handleScrollerRef: () => {},
    handleScroll: () => {},
    handleAtBottomStateChange: () => {},
    handleFollowOutput: () => false,
    showScrollButton: false,
    scrollToBottom: () => {},
    hideScrollButton: () => {},
  }),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Image: {
      ...actual.Image,
      PreviewGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { name?: string }) => options?.name ?? _key,
  }),
}));

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data,
    itemContent,
  }: {
    data: unknown[];
    itemContent: (index: number, item: unknown) => React.ReactNode;
  }) => <div>{data.map((item, index) => itemContent(index, item))}</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/SelectionReplyButton', () => ({
  default: () => null,
}));

describe('MessageList artifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders legacy cron trigger artifacts from the initial artifact fetch', async () => {
    mockListArtifactsInvoke.mockResolvedValue([
      {
        id: 'legacy-cron-trigger:msg-1',
        conversation_id: 'conv-legacy',
        cron_job_id: 'cron-1',
        kind: 'cron_trigger',
        status: 'active',
        payload: {
          cron_job_id: 'cron-1',
          cron_job_name: 'Daily Report',
          triggered_at: 1234,
        },
        created_at: 1234,
        updated_at: 1234,
      },
    ]);

    render(
      <MemoryRouter>
        <ConversationArtifactProvider conversation_id='conv-legacy'>
          <MessageList />
        </ConversationArtifactProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockListArtifactsInvoke).toHaveBeenCalledWith({ conversation_id: 'conv-legacy' });
      expect(screen.getByTestId('message-cron-trigger')).toBeInTheDocument();
      expect(screen.getByText('Daily Report')).toBeInTheDocument();
    });
  });
});
