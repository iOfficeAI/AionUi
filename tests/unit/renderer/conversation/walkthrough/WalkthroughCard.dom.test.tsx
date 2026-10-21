/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { Message } from '@arco-design/web-react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: { defaultValue?: string }) => opts?.defaultValue || k,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@renderer/components/Markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='markdown-view'>{children}</div>,
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

import WalkthroughCard from '@/renderer/pages/conversation/Messages/components/WalkthroughCard';
import type { WalkthroughData } from '@/renderer/pages/conversation/Messages/components/WalkthroughCard/types';
import { copyText } from '@/renderer/utils/ui/clipboard';

describe('WalkthroughCard', () => {
  beforeEach(() => {
    vi.spyOn(Message, 'info').mockImplementation(() => '' as never);
    vi.spyOn(Message, 'warning').mockImplementation(() => '' as never);
    vi.spyOn(Message, 'error').mockImplementation(() => '' as never);
    vi.spyOn(Message, 'success').mockImplementation(() => '' as never);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const sampleData: WalkthroughData = {
    title: 'Parakeet TDT Speech-to-Text',
    summary: 'Guia da nova funcionalidade de voz local.',
    rawContent: '# Raw markdown content',
    sections: [
      {
        id: 'sec-1',
        type: 'delivered',
        title: '1. O que foi Entregue',
        content: 'Modelo Parakeet TDT integrado.',
      },
      {
        id: 'sec-2',
        type: 'howItWorks',
        title: '2. Como Funciona',
        content: 'Decodificação PCM via IPC.',
      },
      {
        id: 'sec-3',
        type: 'usage',
        title: '3. Como Usar',
        content: 'Abra as configurações e selecione o modelo.',
      },
      {
        id: 'sec-4',
        type: 'notes',
        title: '4. O que Prestar Atenção',
        content: 'O modelo roda 100% offline.',
      },
    ],
  };

  it('renders the walkthrough card with title, badge and sections', () => {
    render(<WalkthroughCard walkthrough={sampleData} />);

    expect(screen.getByTestId('walkthrough-card')).toBeInTheDocument();
    expect(screen.getByText('Parakeet TDT Speech-to-Text')).toBeInTheDocument();
    expect(screen.getByText('Walkthrough')).toBeInTheDocument();
    expect(screen.getByText('Guia da nova funcionalidade de voz local.')).toBeInTheDocument();

    expect(screen.getByTestId('walkthrough-section-delivered')).toBeInTheDocument();
    expect(screen.getByTestId('walkthrough-section-howItWorks')).toBeInTheDocument();
    expect(screen.getByTestId('walkthrough-section-usage')).toBeInTheDocument();
    expect(screen.getByTestId('walkthrough-section-notes')).toBeInTheDocument();
  });

  it('copies raw content when copy button is clicked', async () => {
    render(<WalkthroughCard walkthrough={sampleData} />);

    const copyBtn = screen.getByLabelText('Copy Walkthrough');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(copyText).toHaveBeenCalledWith('# Raw markdown content');
    expect(Message.success).toHaveBeenCalledWith('Walkthrough copied to clipboard');
  });

  it('collapses and expands the entire card', () => {
    render(<WalkthroughCard walkthrough={sampleData} />);

    const collapseBtn = screen.getByLabelText('Collapse');
    fireEvent.click(collapseBtn);

    // Body sections should no longer be visible
    expect(screen.queryByTestId('walkthrough-section-delivered')).not.toBeInTheDocument();

    // Click to expand again
    const expandBtn = screen.getByLabelText('Expand');
    fireEvent.click(expandBtn);

    expect(screen.getByTestId('walkthrough-section-delivered')).toBeInTheDocument();
  });

  it('toggles collapse on individual sections', () => {
    render(<WalkthroughCard walkthrough={sampleData} />);

    const sectionTitle = screen.getByText('1. O que foi Entregue');
    expect(screen.getByText('Modelo Parakeet TDT integrado.')).toBeInTheDocument();

    // Click section header to collapse it
    fireEvent.click(sectionTitle);
    expect(screen.queryByText('Modelo Parakeet TDT integrado.')).not.toBeInTheDocument();

    // Click section header to expand it again
    fireEvent.click(sectionTitle);
    expect(screen.getByText('Modelo Parakeet TDT integrado.')).toBeInTheDocument();
  });

  it('renders custom section icon for unrecognized section types', () => {
    const dataWithCustom: WalkthroughData = {
      title: 'Custom Section Walkthrough',
      rawContent: 'test',
      sections: [
        {
          id: 'sec-custom',
          type: 'custom',
          title: '5. Pull Request Status',
          content: 'PR #4247 is open.',
        },
      ],
    };

    render(<WalkthroughCard walkthrough={dataWithCustom} />);
    expect(screen.getByTestId('walkthrough-section-custom')).toBeInTheDocument();
    expect(screen.getByText('5. Pull Request Status')).toBeInTheDocument();
  });

  it('collapses and expands by clicking the header container directly', () => {
    render(<WalkthroughCard walkthrough={sampleData} />);

    const header = screen.getByRole('button', { name: /Parakeet TDT Speech-to-Text/i });
    fireEvent.click(header);

    // Body should be hidden
    expect(screen.queryByTestId('walkthrough-section-delivered')).not.toBeInTheDocument();

    // Click again to expand
    fireEvent.click(header);
    expect(screen.getByTestId('walkthrough-section-delivered')).toBeInTheDocument();
  });

  it('handles copy error gracefully and shows error message', async () => {
    vi.mocked(copyText).mockRejectedValueOnce(new Error('Clipboard denied'));

    render(<WalkthroughCard walkthrough={sampleData} />);

    const copyBtn = screen.getByLabelText('Copy Walkthrough');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(Message.error).toHaveBeenCalledWith('Failed to copy walkthrough');
  });
});
