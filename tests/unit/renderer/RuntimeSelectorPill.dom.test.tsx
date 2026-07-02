/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import RuntimeSelectorPill from '@/renderer/components/agent/RuntimeSelectorPill';

vi.mock('@/renderer/components/agent/MarqueePillLabel', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@icon-park/react', () => ({
  Loading: ({ className }: { className?: string }) => <span aria-hidden='true' className={className} />,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ children, ...props }, ref) => (
      <button ref={ref} type='button' {...props}>
        {children}
      </button>
    )
  ),
}));

describe('RuntimeSelectorPill', () => {
  it('forwards dropdown trigger props and ref to the button anchor', () => {
    const ref = React.createRef<HTMLButtonElement>();

    render(
      <RuntimeSelectorPill
        ref={ref}
        testId='runtime-pill'
        className='pill'
        label='Auto'
        data-dropdown-anchor='model'
        aria-expanded='true'
      />
    );

    const button = screen.getByTestId('runtime-pill');
    expect(button).toHaveAttribute('data-dropdown-anchor', 'model');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(ref.current).toBe(button);
  });
});
