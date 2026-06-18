/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mirror the project convention: t() echoes the key so aria-labels are assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import FontSizeStepper from '@renderer/components/settings/FontSizeStepper';

const DECREASE = 'settings.fontSizeDecrease';
const INCREASE = 'settings.fontSizeIncrease';

describe('FontSizeStepper', () => {
  it('renders the current value and steps within bounds', () => {
    const onChange = vi.fn();
    render(
      <FontSizeStepper value={16} min={12} max={22} step={1} onChange={onChange} resetLabel='Reset' defaultValue={16} />
    );
    expect(screen.getByText('16')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(INCREASE));
    expect(onChange).toHaveBeenCalledWith(17);
    fireEvent.click(screen.getByLabelText(DECREASE));
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it('disables decrease at min and increase at max', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <FontSizeStepper value={12} min={12} max={22} step={1} onChange={onChange} resetLabel='Reset' defaultValue={16} />
    );
    expect((screen.getByLabelText(DECREASE) as HTMLButtonElement).disabled).toBe(true);
    rerender(
      <FontSizeStepper value={22} min={12} max={22} step={1} onChange={onChange} resetLabel='Reset' defaultValue={16} />
    );
    expect((screen.getByLabelText(INCREASE) as HTMLButtonElement).disabled).toBe(true);
  });

  it('resets to defaultValue and disables reset when already at default', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <FontSizeStepper value={18} min={12} max={22} step={1} onChange={onChange} resetLabel='Reset' defaultValue={16} />
    );
    const reset = screen.getByText('Reset').closest('button') as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    expect(onChange).toHaveBeenCalledWith(16);

    rerender(
      <FontSizeStepper value={16} min={12} max={22} step={1} onChange={onChange} resetLabel='Reset' defaultValue={16} />
    );
    expect((screen.getByText('Reset').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not fire onChange when clicking disabled bound buttons', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <FontSizeStepper value={12} min={12} max={22} step={1} onChange={onChange} resetLabel='Reset' defaultValue={16} />
    );
    fireEvent.click(screen.getByLabelText(DECREASE));
    expect(onChange).not.toHaveBeenCalled();

    rerender(
      <FontSizeStepper value={22} min={12} max={22} step={1} onChange={onChange} resetLabel='Reset' defaultValue={16} />
    );
    fireEvent.click(screen.getByLabelText(INCREASE));
    expect(onChange).not.toHaveBeenCalled();
  });
});
