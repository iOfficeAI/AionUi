/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SlashCommandMenu from '../../src/renderer/components/chat/SlashCommandMenu';

describe('SlashCommandMenu', () => {
  it('renders loading text from props and exposes aria-busy', () => {
    render(
      <SlashCommandMenu
        title='Commands'
        hint='Type / to search'
        items={[]}
        activeIndex={0}
        loading
        loadingText='请稍候...'
        onHoverItem={vi.fn()}
        onSelectItem={vi.fn()}
        emptyText='No commands found'
      />
    );

    expect(screen.getByText('请稍候...')).toBeInTheDocument();
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
  });

  it('marks the active item with aria-selected', () => {
    render(
      <SlashCommandMenu
        title='Commands'
        items={[
          { key: 'plan', label: '/plan' },
          { key: 'review', label: '/review' },
        ]}
        activeIndex={1}
        onHoverItem={vi.fn()}
        onSelectItem={vi.fn()}
        emptyText='No commands found'
      />
    );

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });
});
