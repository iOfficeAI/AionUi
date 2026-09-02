/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ToolBlockShell from '@/renderer/pages/conversation/Messages/ToolBlocks/ToolBlockShell';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

/** The body wrapper is only rendered when expanded, so presence of the body
 * test id is the expand-state signal. */
const bodyIsOpen = () => screen.queryByTestId('tool-block-body') !== null;

describe('ToolBlockShell', () => {
  it('renders header with title and summary, body collapsed until expanded', () => {
    render(
      <ToolBlockShell category='bash' titleKey='messages.toolBlocks.bashTitle' summary='cargo test' status='completed'>
        <div data-testid='detail'>detail</div>
      </ToolBlockShell>
    );
    expect(screen.getByText('messages.toolBlocks.bashTitle')).toBeInTheDocument();
    expect(screen.getByText('cargo test')).toBeInTheDocument();
    expect(screen.queryByTestId('detail')).not.toBeInTheDocument();
    expect(bodyIsOpen()).toBe(false);
  });

  it('toggles body on header click', () => {
    render(
      <ToolBlockShell category='bash' titleKey='messages.toolBlocks.bashTitle' status='completed'>
        <div data-testid='detail'>detail</div>
      </ToolBlockShell>
    );
    fireEvent.click(screen.getByRole('button', { name: /bashTitle/ }));
    expect(bodyIsOpen()).toBe(true);
  });

  it('auto-expands while running and collapses on completion unless user touched', () => {
    const { rerender } = render(
      <ToolBlockShell category='read' titleKey='messages.toolBlocks.readTitle' status='running'>
        <div data-testid='detail'>detail</div>
      </ToolBlockShell>
    );
    expect(bodyIsOpen()).toBe(true);
    rerender(
      <ToolBlockShell category='read' titleKey='messages.toolBlocks.readTitle' status='completed'>
        <div data-testid='detail'>detail</div>
      </ToolBlockShell>
    );
    expect(bodyIsOpen()).toBe(false);
  });

  it('does not auto-collapse after the user expanded it manually', () => {
    const { rerender } = render(
      <ToolBlockShell category='read' titleKey='messages.toolBlocks.readTitle' status='running'>
        <div data-testid='detail'>detail</div>
      </ToolBlockShell>
    );
    // collapse first (user touch), then expand again (user touch), then finish
    fireEvent.click(screen.getByRole('button', { name: /readTitle/ }));
    fireEvent.click(screen.getByRole('button', { name: /readTitle/ }));
    rerender(
      <ToolBlockShell category='read' titleKey='messages.toolBlocks.readTitle' status='completed'>
        <div data-testid='detail'>detail</div>
      </ToolBlockShell>
    );
    expect(bodyIsOpen()).toBe(true);
  });

  it('renders a status dot with the status-mapped class', () => {
    const { container, rerender } = render(
      <ToolBlockShell category='bash' titleKey='messages.toolBlocks.bashTitle' status='running'>
        <div data-testid='detail'>detail</div>
      </ToolBlockShell>
    );
    expect(container.querySelector('.tool-block__dot--running')).not.toBeNull();

    rerender(
      <ToolBlockShell category='bash' titleKey='messages.toolBlocks.bashTitle' status='completed'>
        <div data-testid='detail'>detail</div>
      </ToolBlockShell>
    );
    expect(container.querySelector('.tool-block__dot--completed')).not.toBeNull();

    rerender(
      <ToolBlockShell category='bash' titleKey='messages.toolBlocks.bashTitle' status='error'>
        <div data-testid='detail'>detail</div>
      </ToolBlockShell>
    );
    expect(container.querySelector('.tool-block__dot--error')).not.toBeNull();
  });

  it('does not auto-expand while running when autoExpand is false', () => {
    render(
      <ToolBlockShell category='task' titleKey='messages.toolBlocks.taskTitle' status='running' autoExpand={false}>
        <div data-testid='detail'>detail</div>
      </ToolBlockShell>
    );
    expect(bodyIsOpen()).toBe(false);
  });
});
