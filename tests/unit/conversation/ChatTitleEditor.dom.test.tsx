/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// The minimap pulls conversation messages over the IPC bridge; the title editor
// behaviour under test does not depend on it.
vi.mock('@/renderer/pages/conversation/components/ConversationTitleMinimap', () => ({
  default: () => null,
}));

import ChatTitleEditor from '@/renderer/pages/conversation/components/ChatTitleEditor';

const renderEditor = (overrides: Partial<React.ComponentProps<typeof ChatTitleEditor>> = {}) => {
  const setEditingTitle = vi.fn();
  const props: React.ComponentProps<typeof ChatTitleEditor> = {
    editingTitle: false,
    titleDraft: '',
    setTitleDraft: vi.fn(),
    setEditingTitle,
    renameLoading: false,
    canRenameTitle: true,
    submitTitleRename: vi.fn().mockResolvedValue(undefined),
    titleAreaMaxWidth: 400,
    title: '',
    conversation_id: 'conv-1',
    ...overrides,
  };
  render(<ChatTitleEditor {...props} />);
  return { setEditingTitle };
};

describe('ChatTitleEditor with an empty conversation title', () => {
  it('shows the untitled placeholder so the header is not blank', () => {
    renderEditor();
    expect(screen.getByText('conversation.historySearch.untitled')).toBeInTheDocument();
  });

  it('enters edit mode when the title region is clicked', () => {
    const { setEditingTitle } = renderEditor();
    fireEvent.click(screen.getByTestId('chat-title-editor-trigger'));
    expect(setEditingTitle).toHaveBeenCalledWith(true);
  });

  it('stays read-only when rename is unavailable', () => {
    const { setEditingTitle } = renderEditor({ canRenameTitle: false });
    fireEvent.click(screen.getByTestId('chat-title-editor-trigger'));
    expect(setEditingTitle).not.toHaveBeenCalled();
  });
});

describe('ChatTitleEditor with a named conversation', () => {
  it('renders the real title instead of the untitled placeholder', () => {
    renderEditor({ title: '每日 AI 论文简报' });
    expect(screen.getByText('每日 AI 论文简报')).toBeInTheDocument();
    expect(screen.queryByText('conversation.historySearch.untitled')).not.toBeInTheDocument();
  });

  it('enters edit mode when the title region is clicked', () => {
    const { setEditingTitle } = renderEditor({ title: '每日 AI 论文简报' });
    fireEvent.click(screen.getByTestId('chat-title-editor-trigger'));
    expect(setEditingTitle).toHaveBeenCalledWith(true);
  });
});
