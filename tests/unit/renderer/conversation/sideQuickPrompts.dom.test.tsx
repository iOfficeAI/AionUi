/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import {
  SIDE_QUICK_PROMPT_KEYS,
  SIDE_QUICK_PROMPT_ROTATE_MS,
  SIDE_QUICK_PROMPT_VISIBLE_COUNT,
} from '@/renderer/pages/conversation/components/SideConversationPanel/quickPrompts/sideQuickPromptKeys';
import SideQuickPrompts from '@/renderer/pages/conversation/components/SideConversationPanel/quickPrompts/SideQuickPrompts';

// Without an active i18n instance the chip label renders as the full key.
const label = (key: string) => `conversation.sideConversation.quickPrompts.${key}`;

describe('SideQuickPrompts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the first rotation window with the visible-count chips', () => {
    const onPick = vi.fn();
    render(<SideQuickPrompts onPick={onPick} />);

    for (let i = 0; i < SIDE_QUICK_PROMPT_VISIBLE_COUNT; i += 1) {
      expect(screen.getByText(label(SIDE_QUICK_PROMPT_KEYS[i]))).toBeTruthy();
    }
    expect(screen.queryByText(label(SIDE_QUICK_PROMPT_KEYS[SIDE_QUICK_PROMPT_VISIBLE_COUNT]))).toBeFalsy();
  });

  it('hands the visible label text to onPick on click', () => {
    const onPick = vi.fn();
    render(<SideQuickPrompts onPick={onPick} />);

    fireEvent.click(screen.getByText(label(SIDE_QUICK_PROMPT_KEYS[0])));

    expect(onPick).toHaveBeenCalledWith(label(SIDE_QUICK_PROMPT_KEYS[0]));
  });

  it('rotates to the next window on the interval', () => {
    render(<SideQuickPrompts onPick={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(SIDE_QUICK_PROMPT_ROTATE_MS);
    });

    expect(screen.getByText(label(SIDE_QUICK_PROMPT_KEYS[SIDE_QUICK_PROMPT_VISIBLE_COUNT]))).toBeTruthy();
    expect(screen.queryByText(label(SIDE_QUICK_PROMPT_KEYS[0]))).toBeFalsy();
  });

  it('pauses rotation while hovered and resumes on leave', () => {
    const { container } = render(<SideQuickPrompts onPick={vi.fn()} />);

    fireEvent.mouseEnter(container.firstElementChild as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(SIDE_QUICK_PROMPT_ROTATE_MS * 3);
    });
    expect(screen.getByText(label(SIDE_QUICK_PROMPT_KEYS[0]))).toBeTruthy();

    fireEvent.mouseLeave(container.firstElementChild as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(SIDE_QUICK_PROMPT_ROTATE_MS);
    });
    expect(screen.queryByText(label(SIDE_QUICK_PROMPT_KEYS[0]))).toBeFalsy();
  });
});
