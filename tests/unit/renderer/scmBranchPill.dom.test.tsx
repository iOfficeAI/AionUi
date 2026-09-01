/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ScmBranchPill from '@/renderer/pages/conversation/components/ChatLayout/ScmBranchPill';

afterEach(() => {
  cleanup();
});

describe('ScmBranchPill', () => {
  it('renders the branch name when a head name is known', () => {
    render(<ScmBranchPill headName='feat/chat' />);

    expect(screen.getByTestId('scm-branch-pill')).toHaveTextContent('feat/chat');
  });

  it('renders nothing when the head name is absent (detached/unknown head)', () => {
    const { container } = render(<ScmBranchPill />);

    expect(screen.queryByTestId('scm-branch-pill')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
