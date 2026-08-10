/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Verifies the custom-agent editor's image avatar support (issue #3599):
 *  - the avatar preview renders an <img> for data: / image URLs and the emoji
 *    glyph otherwise;
 *  - the "Upload image" button reads a file via IPC, downscales it via canvas,
 *    and persists the resulting data URL as `icon` on save;
 *  - the built-in gallery options are derived from builtin assistants whose
 *    avatar is an image.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en-US' } }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

// Stub canvas: jsdom has no canvas rasterizer, so return a fixed JPEG data URL.
const TO_DATA_URL_RESULT = 'data:image/jpeg;base64,RENAMED';
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D);
HTMLCanvasElement.prototype.toDataURL = vi.fn(() => TO_DATA_URL_RESULT);

// Stub Image so downscaleAvatarDataUrl resolves on the next microtask once
// `src` is assigned. Implemented as a factory (not a class with a `src` field,
// which would shadow the accessor) to keep the setter behavior reliable.
function FakeImage(): { onload: (() => void) | null; src: string; width: number; height: number } {
  let srcValue = '';
  const instance = {
    onload: null as (() => void) | null,
    width: 1024,
    height: 1024,
    get src() {
      return srcValue;
    },
    set src(value: string) {
      srcValue = value;
      queueMicrotask(() => instance.onload?.());
    },
  };
  return instance;
}
Object.defineProperty(globalThis, 'Image', { writable: true, value: FakeImage });

// Mock Message.error used by the upload handler on failure.
const messageErrorMock = vi.fn();
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: { ...actual.Message, error: (...args: unknown[]) => messageErrorMock(...args) },
  };
});

// EmojiPicker: render its trigger children and expose props so tests can
// assert the built-in options were passed and drive an emoji selection.
let lastEmojiPickerProps: {
  value?: string;
  onChange?: (value: string) => void;
  builtinAvatars?: Array<{ id: string; label: string; src: string }>;
} = {};
vi.mock('@/renderer/components/chat/EmojiPicker', () => ({
  default: ({
    value,
    onChange,
    builtinAvatars,
    children,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    builtinAvatars?: Array<{ id: string; label: string; src: string }>;
    children?: React.ReactNode;
  }) => {
    lastEmojiPickerProps = { value, onChange, builtinAvatars };
    return (
      <div data-testid='emoji-picker-stub' data-value={value ?? ''}>
        {children}
        <button type='button' data-testid='emoji-picker-select-emoji' onClick={() => onChange?.('😎')}>
          pick-emoji
        </button>
      </div>
    );
  },
}));

vi.mock('@uiw/react-codemirror', () => ({
  default: () => <div data-testid='codemirror-stub' />,
}));

// IPC mocks for the avatar upload flow + (unused here) test connection.
const showOpenMock = vi.fn();
const getImageBase64Mock = vi.fn();
vi.mock('@/common/adapter/ipcBridge', () => ({
  acpConversation: {
    testCustomAgent: { invoke: vi.fn() },
  },
  dialog: { showOpen: { invoke: (...args: unknown[]) => showOpenMock(...args) } },
  fs: { getImageBase64: { invoke: (...args: unknown[]) => getImageBase64Mock(...args) } },
}));

// useAssistantList: return one builtin assistant with an image avatar and one
// with an emoji avatar (should be filtered out of the gallery).
const assistantListMock = vi.fn();
vi.mock('@/renderer/hooks/assistant', () => ({
  useAssistantList: (...args: unknown[]) => assistantListMock(...args),
}));

import InlineAgentEditor from '@/renderer/pages/settings/AgentSettings/InlineAgentEditor';

const BUILTIN_IMAGE_ASSISTANT = {
  id: 'pdf-to-ppt',
  name: 'PDF to PPT',
  source: 'builtin',
  avatar: '/api/assistants/pdf-to-ppt/avatar',
  name_i18n: { 'en-US': 'PDF to PPT' },
};
const BUILTIN_EMOJI_ASSISTANT = {
  id: 'word-creator',
  name: 'Word Creator',
  source: 'builtin',
  avatar: '📝',
  name_i18n: { 'en-US': 'Word Creator' },
};

const renderEditor = (overrides?: { onSave?: typeof onSaveDefault }) => {
  const onSave = overrides?.onSave ?? vi.fn();
  const view = render(
    <ConfigProvider>
      <InlineAgentEditor onSave={onSave} onCancel={vi.fn()} />
    </ConfigProvider>
  );
  return { view, onSave };
};
const onSaveDefault = vi.fn();

describe('InlineAgentEditor — image avatar', () => {
  beforeEach(() => {
    showOpenMock.mockReset();
    getImageBase64Mock.mockReset();
    messageErrorMock.mockReset();
    assistantListMock.mockReset();
    assistantListMock.mockReturnValue({
      assistants: [BUILTIN_IMAGE_ASSISTANT, BUILTIN_EMOJI_ASSISTANT],
      localeKey: 'en-US',
    });
  });

  afterEach(() => {
    cleanup();
    lastEmojiPickerProps = {};
  });

  it('renders the default 🤖 emoji preview', () => {
    renderEditor();
    // The Avatar renders the emoji glyph as a text child.
    const trigger = screen.getByTestId('emoji-picker-stub');
    expect(trigger.getAttribute('data-value')).toBe('🤖');
    // No <img> in the avatar trigger area initially.
    expect(trigger.parentElement?.querySelector('img')).toBeNull();
  });

  it('derives built-in gallery options only from image avatars', () => {
    renderEditor();
    expect(lastEmojiPickerProps.builtinAvatars).toEqual([
      { id: 'pdf-to-ppt', label: 'PDF to PPT', src: '/api/assistants/pdf-to-ppt/avatar' },
    ]);
  });

  it('lets an emoji pick flow through to the preview and the draft', async () => {
    const onSave = vi.fn();
    renderEditor({ onSave });
    const user = userEvent.setup();

    await act(async () => {
      await user.click(screen.getByTestId('emoji-picker-select-emoji'));
    });
    expect(lastEmojiPickerProps.value).toBe('😎');

    // Fill required fields and save.
    const inputs = document.querySelectorAll('.arco-input');
    await act(async () => {
      await user.type(inputs[0] as HTMLElement, 'My Agent');
      await user.type(inputs[1] as HTMLElement, 'some-cli');
    });
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^common\.save$/i }));
    });

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ icon: '😎' }));
  });

  it('uploads an image, downscales it, and persists the data URL as icon', async () => {
    const onSave = vi.fn();
    const rawDataUrl = 'data:image/png;base64,SUPERLONG';
    showOpenMock.mockResolvedValue(['/tmp/avatar.png']);
    getImageBase64Mock.mockResolvedValue(rawDataUrl);

    renderEditor({ onSave });
    const user = userEvent.setup();

    await act(async () => {
      await user.click(screen.getByTestId('btn-agent-avatar-upload'));
    });

    await waitFor(() => expect(showOpenMock).toHaveBeenCalledTimes(1));
    expect(getImageBase64Mock).toHaveBeenCalledWith({ path: '/tmp/avatar.png' });

    // The canvas stub rewrites the data URL; the editor should now hold it.
    await waitFor(() => {
      expect(lastEmojiPickerProps.value).toBe(TO_DATA_URL_RESULT);
    });

    // Fill required fields and save; the draft should carry the data URL.
    const inputs = document.querySelectorAll('.arco-input');
    await act(async () => {
      await user.type(inputs[0] as HTMLElement, 'Img Agent');
      await user.type(inputs[1] as HTMLElement, 'some-cli');
    });
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /^common\.save$/i }));
    });

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ icon: TO_DATA_URL_RESULT }));
  });

  it('shows an error toast and keeps the previous avatar when the upload fails', async () => {
    const onSave = vi.fn();
    showOpenMock.mockResolvedValue(['/tmp/avatar.png']);
    getImageBase64Mock.mockRejectedValue(new Error('boom'));

    renderEditor({ onSave });
    const user = userEvent.setup();

    await act(async () => {
      await user.click(screen.getByTestId('btn-agent-avatar-upload'));
    });

    await waitFor(() => expect(messageErrorMock).toHaveBeenCalledTimes(1));
    // Avatar stays at the default emoji.
    expect(lastEmojiPickerProps.value).toBe('🤖');
  });
});
