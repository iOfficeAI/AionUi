/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('@/renderer/components/chat/EmojiPicker', () => ({
  default: ({ children, onChange }: { children: React.ReactNode; onChange: (emoji: string) => void }) => (
    <div>
      {children}
      <button type='button' data-testid='pick-emoji' onClick={() => onChange('🐶')}>
        pick
      </button>
    </div>
  ),
}));

vi.mock('@uiw/react-codemirror', () => ({
  default: () => <div data-testid='codemirror-stub' />,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  acpConversation: {
    testCustomAgent: { invoke: vi.fn() },
  },
}));

vi.mock('@/renderer/utils/model/agentLogo', async (importActual) => {
  const actual = await importActual<typeof import('@/renderer/utils/model/agentLogo')>();
  return {
    ...actual,
    useAgentLogos: () => ({}),
  };
});

const messageErrorMock = vi.hoisted(() => vi.fn());
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  const ReactActual = await vi.importActual<typeof import('react')>('react');
  const Popover = ({
    children,
    content,
    popupVisible,
    onVisibleChange,
  }: {
    children?: React.ReactNode;
    content?: React.ReactNode;
    popupVisible?: boolean;
    onVisibleChange?: (visible: boolean) => void;
  }) =>
    ReactActual.createElement(
      'span',
      null,
      ReactActual.createElement('span', { onClick: () => onVisibleChange?.(!popupVisible) }, children),
      popupVisible ? ReactActual.createElement('div', null, content) : null
    );
  return { ...actual, Message: { ...actual.Message, error: messageErrorMock }, Popover };
});

import { readImageAsDataUrl } from '@/renderer/pages/settings/AgentSettings/InlineAgentEditor';
import InlineAgentEditor from '@/renderer/pages/settings/AgentSettings/InlineAgentEditor';
import AgentCard from '@renderer/pages/settings/AgentSettings/AgentCard';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

afterEach(() => {
  cleanup();
  messageErrorMock.mockReset();
});

function stubFileReader(options: { result: string | ArrayBuffer | null; fire: 'load' | 'error' }): () => void {
  const Original = global.FileReader;
  class StubReader {
    public result: string | ArrayBuffer | null = options.result;
    public onload: null | (() => void) = null;
    public onerror: null | (() => void) = null;
    public readAsDataURL(): void {
      if (options.fire === 'load') this.onload?.();
      else this.onerror?.();
    }
  }
  global.FileReader = StubReader as unknown as typeof FileReader;
  return () => {
    global.FileReader = Original;
  };
}

describe('readImageAsDataUrl', () => {
  it('resolves with the data URL on successful read', async () => {
    const restore = stubFileReader({ result: PNG_DATA_URL, fire: 'load' });
    await expect(readImageAsDataUrl(new File(['x'], 'a.png', { type: 'image/png' }))).resolves.toBe(PNG_DATA_URL);
    restore();
  });

  it('resolves with null when the result is not a string', async () => {
    const restore = stubFileReader({ result: new ArrayBuffer(2), fire: 'load' });
    await expect(readImageAsDataUrl(new File(['x'], 'a.png', { type: 'image/png' }))).resolves.toBeNull();
    restore();
  });

  it('resolves with null on read error', async () => {
    const restore = stubFileReader({ result: null, fire: 'error' });
    await expect(readImageAsDataUrl(new File(['x'], 'a.png', { type: 'image/png' }))).resolves.toBeNull();
    restore();
  });
});

describe('AgentCard custom image avatar', () => {
  const props = {
    type: 'custom' as const,
    boundAssistants: [],
    onTestConnection: vi.fn(),
    onConfigure: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggle: vi.fn(),
  };

  it('renders a data URL icon as an image', () => {
    const { container } = render(
      <AgentCard
        {...props}
        agent={
          {
            id: 'custom-img',
            name: 'Image Agent',
            command: 'cmd',
            enabled: true,
            icon: PNG_DATA_URL,
          } as never
        }
      />
    );

    expect(container.querySelector('img')?.getAttribute('src')).toBe(PNG_DATA_URL);
    expect(container.textContent).not.toContain('data:image');
  });

  it('renders an emoji icon as text', () => {
    const { container } = render(
      <AgentCard
        {...props}
        agent={
          {
            id: 'custom-emoji',
            name: 'Emoji Agent',
            command: 'cmd',
            enabled: true,
            icon: '🐙',
          } as never
        }
      />
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('🐙');
  });
});

describe('InlineAgentEditor image avatar', () => {
  beforeEach(() => {
    messageErrorMock.mockReset();
  });

  const renderEditor = () =>
    render(
      <ConfigProvider>
        <InlineAgentEditor onSave={vi.fn()} onCancel={vi.fn()} />
      </ConfigProvider>
    );

  const openAvatarMenu = async (): Promise<void> => {
    fireEvent.keyDown(screen.getByRole('button', { name: 'settings.agentAvatarEdit' }), { key: 'Enter' });
    await screen.findByText('settings.agentAvatarUpload');
  };

  const openEmojiPicker = async (): Promise<void> => {
    await openAvatarMenu();
    fireEvent.click(screen.getByText('settings.agentAvatarEmoji'));
    await screen.findByTestId('pick-emoji');
  };

  const selectFile = (container: HTMLElement, file: File): void => {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { files: [file] } });
  };

  it('shows an image preview when editing an agent whose icon is an image', () => {
    const { container } = render(
      <ConfigProvider>
        <InlineAgentEditor
          agent={{ id: 'a', name: 'Img', command: 'cmd', icon: PNG_DATA_URL } as never}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      </ConfigProvider>
    );

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(PNG_DATA_URL);
    expect(img?.getAttribute('alt')).toBe('settings.agentAvatarAlt');
  });

  it('shows the emoji glyph for a fresh draft', () => {
    const { container } = renderEditor();

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('🤖');
  });

  it('applies an emoji chosen via the emoji picker', async () => {
    const { container } = renderEditor();

    await act(async () => {
      await openEmojiPicker();
      fireEvent.click(screen.getByTestId('pick-emoji'));
    });

    await waitFor(() => {
      expect(container.textContent).toContain('🐶');
    });
  });

  it('renders the upload trigger button', async () => {
    renderEditor();

    await openAvatarMenu();

    expect(screen.getByText('settings.agentAvatarUpload')).toBeTruthy();
  });

  it('inlines a valid uploaded image into the avatar preview', async () => {
    const restore = stubFileReader({ result: PNG_DATA_URL, fire: 'load' });
    const { container } = renderEditor();

    await act(async () => {
      await openAvatarMenu();
      selectFile(container, new File(['tiny'], 'a.png', { type: 'image/png' }));
    });

    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe(PNG_DATA_URL);
    });
    expect(messageErrorMock).not.toHaveBeenCalled();
    restore();
  });

  it('rejects an oversized image with an error message', async () => {
    const { container } = renderEditor();
    const huge = new File([new Uint8Array(1024 * 1024 + 1)], 'big.png', { type: 'image/png' });

    await act(async () => {
      await openAvatarMenu();
      selectFile(container, huge);
    });

    await waitFor(() => {
      expect(messageErrorMock).toHaveBeenCalledWith('settings.agentAvatarTooLarge');
    });
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows an error when the image cannot be read', async () => {
    const restore = stubFileReader({ result: null, fire: 'error' });
    const { container } = renderEditor();

    await act(async () => {
      await openAvatarMenu();
      selectFile(container, new File(['tiny'], 'a.png', { type: 'image/png' }));
    });

    await waitFor(() => {
      expect(messageErrorMock).toHaveBeenCalledWith('settings.agentAvatarReadFailed');
    });
    expect(container.querySelector('img')).toBeNull();
    restore();
  });
});
