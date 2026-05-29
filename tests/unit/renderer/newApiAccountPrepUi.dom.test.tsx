/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * DesktopLoginGate managed CLI prep progress is handled by the actual component.
 * This test verifies the module can be imported.
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/renderer/hooks/context/NewApiAccountContext', () => ({
  useNewApiAccount: () => ({
    prepStatus: null,
    retryPrep: vi.fn(),
  }),
}));

import DesktopLoginGate from '@/renderer/components/layout/DesktopLoginGate';

describe('DesktopLoginGate managed CLI prep progress', () => {
  it('loads without error', () => {
    const { container } = render(<DesktopLoginGate />);
    expect(container).toBeTruthy();
  });
});
