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
  ExplorerContainer: ({ projectId }: { projectId?: string }) => <div data-testid='explorer'>{projectId ?? ''}</div>,
}));

import ChatSlider from '@/renderer/pages/conversation/components/ChatSlider';

const conv = (over: Record<string, unknown>): TChatConversation => over as unknown as TChatConversation;

afterEach(() => cleanup());

describe('ChatSlider (project Explorer passthrough / side-only container otherwise)', () => {
  it('renders the project Explorer when the conversation has a project_id', () => {
    render(
      <ChatSlider conversation={conv({ id: 'c1', type: 'acp', project_id: 'proj-9', extra: { workspace: '/ws' } })} />
    );
    expect(screen.getByTestId('explorer')).toHaveTextContent('proj-9');
  });

  it('renders the container without a project id (side-only mode) when project_id is missing', () => {
    // Pre-backfill workspace conversation or pure chat: the container hosts the
    // 侧边会话 tab only and renders nothing itself when side is unsupported.
    render(<ChatSlider conversation={conv({ id: 'c1', type: 'acp', extra: { workspace: '/ws/legacy' } })} />);
    expect(screen.getByTestId('explorer')).toHaveTextContent('');
  });

  it('renders the Explorer regardless of conversation type when project_id is set', () => {
    render(
      <ChatSlider conversation={conv({ id: 'c1', type: 'codex', project_id: 'proj-x', extra: { workspace: '/ws' } })} />
    );
    expect(screen.getByTestId('explorer')).toHaveTextContent('proj-x');
  });

  it('renders the side-only container for a pure-chat conversation (no project_id, no workspace)', () => {
    render(<ChatSlider conversation={conv({ id: 'c1', type: 'acp', extra: {} })} />);
    expect(screen.getByTestId('explorer')).toBeInTheDocument();
  });
});
