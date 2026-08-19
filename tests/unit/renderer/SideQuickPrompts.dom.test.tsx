/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('.').pop() ?? key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, size: _size, type: _type, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
}));

import SideQuickPrompts from '@/renderer/pages/conversation/components/SideConversationPanel/quickPrompts/SideQuickPrompts';

describe('SideQuickPrompts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a batch of plain-text pill chips (no icons) and picks the label on click', () => {
    const onPick = vi.fn();
    const { container } = render(<SideQuickPrompts onPick={onPick} />);

    const chips = container.querySelectorAll('button');
    expect(chips).toHaveLength(4);
    expect(chips[0].textContent).toBe('catchMeUp');
    chips.forEach((chip) => {
      expect(chip.querySelector('svg')).toBeFalsy();
    });

    fireEvent.click(chips[1]);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('changedFiles');
  });

  it('rotates to the next batch of prompts after the rotation interval', () => {
    const { container } = render(<SideQuickPrompts onPick={() => {}} />);
    const firstBatch = [...container.querySelectorAll('button')].map((chip) => chip.textContent);
    expect(firstBatch).toEqual(['catchMeUp', 'changedFiles', 'inPlainTerms', 'explainSelection']);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    const secondBatch = [...container.querySelectorAll('button')].map((chip) => chip.textContent);
    expect(secondBatch).toEqual(['explainError', 'safeToContinue', 'confidenceLevel', 'didIForget']);
  });
});
