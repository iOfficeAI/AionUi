/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { configGetMock, copyTextMock, messageErrorMock } = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  copyTextMock: vi.fn(),
  messageErrorMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGetMock,
    onChange: vi.fn(() => vi.fn()),
    whenReady: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/renderer/utils/ui/clipboard', () => ({ copyText: copyTextMock }));
vi.mock('@/renderer/components/chat/SpeechInputButton', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/UploadProgressBar', () => ({ default: () => null }));
vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: 'transparent',
    inactiveBorderColor: 'transparent',
    activeShadow: 'none',
  }),
}));
vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({ useMessageList: () => [] }));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    clearDomSnippets: vi.fn(),
    domSnippets: [],
    removeDomSnippet: vi.fn(),
    setSendBoxHandler: vi.fn(),
  }),
}));
vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  Input: Object.assign(() => null, {
    TextArea: ({ onChange, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
      <textarea {...props} onChange={(event) => onChange?.(event)} />
    ),
  }),
  Message: {
    error: messageErrorMock,
    success: vi.fn(),
    useMessage: () => [{ error: vi.fn(), warning: vi.fn() }, null],
    warning: vi.fn(),
  },
  Tag: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@icon-park/react', () => ({
  ArrowUp: () => null,
  CloseSmall: () => null,
  Plus: () => null,
  Quote: () => null,
}));

import SendBox from '@/renderer/components/chat/SendBox';

describe('SendBox prompt copy integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configGetMock.mockReturnValue(true);
    copyTextMock.mockResolvedValue(undefined);
  });

  it('copies the exact controlled prompt before sending it', async () => {
    const events: string[] = [];
    copyTextMock.mockImplementation(async () => {
      events.push('copy');
    });
    const onSend = vi.fn(async () => {
      events.push('send');
    });
    const prompt = 'first line\n  indented second line  ';

    render(<SendBox value={prompt} onChange={vi.fn()} onSend={onSend} />);
    fireEvent.click(screen.getByTestId('sendbox-send-btn'));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith(prompt));
    expect(copyTextMock).toHaveBeenCalledExactlyOnceWith(prompt);
    expect(events).toEqual(['copy', 'send']);
  });

  it('reports clipboard failures without blocking the send', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    copyTextMock.mockRejectedValue(new Error('clipboard denied'));

    render(<SendBox value='still send this' onChange={vi.fn()} onSend={onSend} />);
    fireEvent.click(screen.getByTestId('sendbox-send-btn'));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('still send this'));
    expect(messageErrorMock).toHaveBeenCalledExactlyOnceWith('messages.copyFailed');
  });

  it('keeps prompt copying disabled when the preference is missing', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    configGetMock.mockReturnValue(undefined);

    render(<SendBox value='send without copying' onChange={vi.fn()} onSend={onSend} />);
    fireEvent.click(screen.getByTestId('sendbox-send-btn'));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('send without copying'));
    expect(copyTextMock).not.toHaveBeenCalled();
  });
});
