/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      fetchRemoteImage: { invoke: vi.fn() },
      getImageBase64: { invoke: vi.fn() },
      getFileMetadata: { invoke: vi.fn() },
      readFile: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/common/chat/chatLib', () => ({
  joinPath: (base: string, rel: string) => `${base}/${rel}`,
}));

vi.mock('@/renderer/hooks/ui/useTextSelection', () => ({
  useTextSelection: () => ({ selectedText: '', selectionPosition: null, clearSelection: vi.fn() }),
}));

vi.mock('@/renderer/utils/chat/latexDelimiters', () => ({
  convertLatexDelimiters: (text: string) => text,
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ openPreview: vi.fn() }),
}));

vi.mock('@/renderer/pages/conversation/Preview/components/editors/MarkdownEditor', () => ({
  default: () => <div data-testid='markdown-editor' />,
}));

vi.mock('@/renderer/pages/conversation/Preview/components/renderers/SelectionToolbar', () => ({
  default: () => <div data-testid='selection-toolbar' />,
}));

vi.mock('@/renderer/pages/conversation/Preview/hooks/useScrollSyncHelpers', () => ({
  useContainerScroll: vi.fn(),
  useContainerScrollTarget: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

import MarkdownViewer from '@/renderer/pages/conversation/Preview/components/viewers/MarkdownViewer';

describe('MarkdownViewer heading rendering', () => {
  it('renders distinct texts for multiple headings of the same level', () => {
    const content = ['# Alpha Title', 'body one', '# Beta Title', 'body two', '# Gamma Title', 'body three'].join(
      '\n\n'
    );
    render(<MarkdownViewer content={content} />);

    expect(screen.getByText('Alpha Title')).toBeInTheDocument();
    expect(screen.getByText('Beta Title')).toBeInTheDocument();
    expect(screen.getByText('Gamma Title')).toBeInTheDocument();
  });

  it('updates heading texts when content changes', () => {
    const { rerender } = render(<MarkdownViewer content={'# First Draft\n\nsome body'} />);
    expect(screen.getByText('First Draft')).toBeInTheDocument();

    rerender(<MarkdownViewer content={'# Final Version\n\nsome body'} />);

    expect(screen.queryByText('First Draft')).not.toBeInTheDocument();
    expect(screen.getByText('Final Version')).toBeInTheDocument();
  });

  it('updates every heading when a growing document is re-rendered', () => {
    // Simulates an agent progressively writing a markdown file that the
    // preview refreshes on each change.
    const { rerender } = render(<MarkdownViewer content={'# Chapter One'} />);
    expect(screen.getByText('Chapter One')).toBeInTheDocument();

    rerender(<MarkdownViewer content={'# Chapter One\n\ntext\n\n# Chapter Two'} />);
    expect(screen.getByText('Chapter One')).toBeInTheDocument();
    expect(screen.getByText('Chapter Two')).toBeInTheDocument();

    rerender(<MarkdownViewer content={'# Intro\n\ntext\n\n# Chapter One\n\ntext\n\n# Chapter Two'} />);
    expect(screen.getByText('Intro')).toBeInTheDocument();
    expect(screen.getByText('Chapter One')).toBeInTheDocument();
    expect(screen.getByText('Chapter Two')).toBeInTheDocument();
  });

  it('renders distinct heading texts when the document contains raw HTML', () => {
    // rehype-raw re-parses the tree and drops node positions, which the
    // built-in Streamdown heading memo comparator relies on.
    const content = ['<div>raw html block</div>', '## Section A', 'body', '## Section B', 'body', '## Section C'].join(
      '\n\n'
    );
    const { rerender } = render(<MarkdownViewer content={content} />);

    expect(screen.getByText('Section A')).toBeInTheDocument();
    expect(screen.getByText('Section B')).toBeInTheDocument();
    expect(screen.getByText('Section C')).toBeInTheDocument();

    const updated = ['<div>raw html block</div>', '## Renamed A', 'body', '## Renamed B', 'body', '## Renamed C'].join(
      '\n\n'
    );
    rerender(<MarkdownViewer content={updated} />);

    expect(screen.getByText('Renamed A')).toBeInTheDocument();
    expect(screen.getByText('Renamed B')).toBeInTheDocument();
    expect(screen.getByText('Renamed C')).toBeInTheDocument();
    expect(screen.queryByText('Section A')).not.toBeInTheDocument();
  });
});
