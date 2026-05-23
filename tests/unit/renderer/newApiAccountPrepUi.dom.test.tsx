/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/renderer/hooks/context/NewApiAccountContext', () => ({
  useNewApiAccount: () => ({
    prepStatus: {
      inProgress: true,
      completed: false,
      stage: 'installing_hermes',
      completedTargets: [],
      percent: 35,
    },
    retryPrep: vi.fn(),
  }),
}));

import DesktopLoginGate from '@/renderer/components/layout/DesktopLoginGate';

describe('DesktopLoginGate managed CLI prep progress', () => {
  it('renders the unauthenticated prep progress panel', () => {
    render(<DesktopLoginGate />);

    expect(screen.getByTestId('managed-cli-prep-progress')).toBeInTheDocument();
    expect(screen.getByText(/35%/)).toBeInTheDocument();
  });
});
