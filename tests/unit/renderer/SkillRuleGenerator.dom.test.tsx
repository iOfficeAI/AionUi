/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SkillRuleGenerator from '@/renderer/pages/conversation/components/SkillRuleGenerator';
import { loadLatestConversationMessages } from '@/renderer/utils/chat/messagePagination';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  responseStreamOn: vi.fn(),
  loadLatestConversationMessages: vi.fn(),
}));

vi.mock('@arco-design/web-react', () => {
  const Button = ({ children, icon, ...props }: any) => (
    <button type='button' {...props}>
      {icon}
      {children}
    </button>
  );
  const Dropdown = ({ children, droplist }: any) => (
    <div>
      {children}
      <div>{droplist}</div>
    </div>
  );
  const Menu = ({ children }: any) => <div>{children}</div>;
  Menu.Item = ({ children, onClick }: any) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  );
  const Modal = ({ children, visible, onOk, okText }: any) =>
    visible ? (
      <div role='dialog'>
        {children}
        <button type='button' onClick={onOk}>
          {okText}
        </button>
      </div>
    ) : null;
  const Radio = ({ children }: any) => <label>{children}</label>;
  Radio.Group = ({ children }: any) => <div>{children}</div>;

  return {
    Button,
    Dropdown,
    Empty: () => <div />,
    Input: ({ onChange, placeholder, value }: any) => (
      <input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    ),
    List: () => <div />,
    Menu,
    Message: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
    Modal,
    Radio,
    Spin: ({ children }: any) => <div>{children}</div>,
    Typography: {
      Text: ({ children }: any) => <span>{children}</span>,
    },
  };
});

vi.mock('@icon-park/react', () => ({
  FolderOpen: () => <span />,
  Lightning: () => <span />,
  Magic: () => <span />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      refreshCustomAgents: {
        invoke: vi.fn(),
      },
    },
    assistants: {
      create: {
        invoke: vi.fn(),
      },
    },
    conversation: {
      responseStream: {
        on: mocks.responseStreamOn,
      },
      sendMessage: {
        invoke: mocks.sendMessage,
      },
    },
    fs: {
      getFilesByDir: {
        invoke: vi.fn(),
      },
      readFile: {
        invoke: vi.fn(),
      },
      writeAssistantRule: {
        invoke: vi.fn(),
      },
    },
  },
  uuid: () => 'msg-generated',
}));

vi.mock('@/renderer/utils/chat/messagePagination', () => ({
  loadLatestConversationMessages: mocks.loadLatestConversationMessages,
}));

const loadLatestMessages = vi.mocked(loadLatestConversationMessages);

describe('SkillRuleGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.responseStreamOn.mockReturnValue(() => {});
    mocks.sendMessage.mockResolvedValue(undefined);
    mocks.loadLatestConversationMessages.mockResolvedValue({
      items: [
        {
          id: 'msg-1',
          conversation_id: 'conversation-1',
          msg_id: 'msg-1',
          type: 'text',
          position: 'right',
          content: { content: 'Summarize this repository' },
        },
      ],
      oldest_cursor: null,
      newest_cursor: null,
      has_more_before: false,
      has_more_after: false,
    });
  });

  it('loads the latest compact message window when generating from history', async () => {
    render(<SkillRuleGenerator conversation_id='conversation-1' workspace='/tmp/workspace' />);

    fireEvent.click(screen.getByText('Generate from History'));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(screen.getByPlaceholderText('e.g. Excel Translator'), {
      target: { value: 'Repo Summarizer' },
    });
    fireEvent.click(within(dialog).getByText('Generate'));

    await waitFor(() => {
      expect(loadLatestMessages).toHaveBeenCalledWith('conversation-1', {
        limit: 50,
        contentMode: 'compact',
      });
    });
  });
});
