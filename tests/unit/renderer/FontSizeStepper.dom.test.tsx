/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import FontSizeStepper from '@renderer/components/settings/FontSizeStepper';

describe('FontSizeStepper', () => {
  it('renders the current value and steps within bounds', () => {
    const onChange = vi.fn();
    render(
      <FontSizeStepper
        value={16}
        min={12}
        max={22}
        step={1}
        onChange={onChange}
        resetLabel='Reset'
        defaultValue={16}
      />
    );
    expect(screen.getByText('16')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('increase'));
    expect(onChange).toHaveBeenCalledWith(17);
    fireEvent.click(screen.getByLabelText('decrease'));
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it('disables decrease at min and increase at max', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <FontSizeStepper
        value={12}
        min={12}
        max={22}
        step={1}
        onChange={onChange}
        resetLabel='Reset'
        defaultValue={16}
      />
    );
    expect((screen.getByLabelText('decrease') as HTMLButtonElement).disabled).toBe(true);
    rerender(
      <FontSizeStepper
        value={22}
        min={12}
        max={22}
        step={1}
        onChange={onChange}
        resetLabel='Reset'
        defaultValue={16}
      />
    );
    expect((screen.getByLabelText('increase') as HTMLButtonElement).disabled).toBe(true);
  });
});
