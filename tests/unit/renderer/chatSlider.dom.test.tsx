/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';

// Stub the explorer to a marker so the test asserts only the gating choice.
vi.mock('@/renderer/pages/conversation/explorer/ExplorerContainer', () => ({
  ExplorerContainer: ({ projectId }: { projectId: string }) => <div data-testid='explorer'>{projectId}</div>,
}));

import ChatSlider from '@/renderer/pages/conversation/components/ChatSlider';

const conv = (over: Record<string, unknown>): TChatConversation => over as unknown as TChatConversation;

afterEach(() => cleanup());

describe('ChatSlider (post-teardown: project Explorer only, legacy tree removed)', () => {
  it('renders the project Explorer when the conversation has a project_id', () => {
    render(
      <ChatSlider conversation={conv({ id: 'c1', type: 'acp', project_id: 'proj-9', extra: { workspace: '/ws' } })} />
    );
    expect(screen.getByTestId('explorer')).toHaveTextContent('proj-9');
  });

  it('renders an empty sider (no legacy tree) for a workspace conversation without project_id', () => {
    // Pre-backfill workspace conversation: no project_id yet → nothing here; the
    // Explorer host takes over once the project_id backfill lands.
    render(<ChatSlider conversation={conv({ id: 'c1', type: 'acp', extra: { workspace: '/ws/legacy' } })} />);
    expect(screen.queryByTestId('explorer')).not.toBeInTheDocument();
  });

  it('renders the Explorer regardless of conversation type when project_id is set', () => {
    render(
      <ChatSlider conversation={conv({ id: 'c1', type: 'codex', project_id: 'proj-x', extra: { workspace: '/ws' } })} />
    );
    expect(screen.getByTestId('explorer')).toHaveTextContent('proj-x');
  });

  it('renders an empty sider for a pure-chat conversation (no project_id, no workspace)', () => {
    render(<ChatSlider conversation={conv({ id: 'c1', type: 'acp', extra: {} })} />);
    expect(screen.queryByTestId('explorer')).not.toBeInTheDocument();
  });
});
