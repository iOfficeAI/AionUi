/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const acpChatMock = vi.fn();
const aionrsChatMock = vi.fn();

vi.mock('@renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  default: (props: Record<string, unknown>) => {
    acpChatMock(props);
    return <div data-testid='acp-chat' />;
  },
}));
vi.mock('@renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  default: (props: Record<string, unknown>) => {
    aionrsChatMock(props);
    return <div data-testid='aionrs-chat' />;
  },
}));
vi.mock('@renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection', () => ({
  useAionrsModelSelection: () => ({ current_model: undefined }),
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      update: { invoke: vi.fn().mockResolvedValue(true) },
    },
  },
}));

import SideChildChat from '@/renderer/pages/conversation/components/SideConversationPanel/SideChildChat';
import type { TChatConversation } from '@/common/config/storage';

const acpChild = {
  id: 'c1',
  type: 'acp',
  name: 'Side',
  created_at: 1,
  modified_at: 2,
  model: { id: 'm', platform: 'openai', name: 'p', base_url: '', api_key: '', use_model: 'gpt' },
  extra: {
    backend: 'hermes',
    side_mode: true,
    side_fork_mode: 'agent_fork',
    parent_conversation_id: 'p1',
    forked_at_msg_id: 'anchor',
  },
} as unknown as TChatConversation;

const snapshotChild = {
  ...acpChild,
  id: 'c2',
  extra: { ...acpChild.extra, side_fork_mode: 'text_snapshot', forked_at_msg_id: 'anchor' },
} as unknown as TChatConversation;

const aionrsChild = {
  id: 'c3',
  type: 'aionrs',
  name: 'Side',
  created_at: 1,
  modified_at: 2,
  model: { id: 'm', platform: 'aionrs', name: 'p', base_url: '', api_key: '', use_model: 'gpt' },
  extra: { workspace: '/w', side_mode: true, side_fork_mode: 'agent_fork', forked_at_msg_id: 'anchor' },
} as unknown as TChatConversation;

beforeEach(() => {
  acpChatMock.mockClear();
  aionrsChatMock.mockClear();
});

describe('SideChildChat', () => {
  it('renders ACP children with their fork boundary and a welcome empty slot', () => {
    render(<SideChildChat conversation={acpChild} />);

    expect(screen.getByTestId('acp-chat')).toBeTruthy();
    const props = acpChatMock.mock.calls[0][0];
    expect(props.conversation_id).toBe('c1');
    expect(props.backend).toBe('hermes');
    expect(props.sideForkBoundaryMsgId).toBe('anchor');
    expect(props.isSideMode).toBe(true);
    expect(props.emptySlot).toBeTruthy();
    // The in-message fork entry navigates the whole page — never offered
    // inside a side thread.
    expect(props.forkCapability).toBeUndefined();
  });

  it('does not pass a fork boundary for snapshot children (no inherited history)', () => {
    render(<SideChildChat conversation={snapshotChild} />);

    expect(acpChatMock.mock.calls[0][0].sideForkBoundaryMsgId).toBeUndefined();
  });

  it('renders aionrs children through AionrsChat', () => {
    render(<SideChildChat conversation={aionrsChild} />);

    expect(screen.getByTestId('aionrs-chat')).toBeTruthy();
    const props = aionrsChatMock.mock.calls[0][0];
    expect(props.conversation_id).toBe('c3');
    expect(props.workspace).toBe('/w');
    expect(props.sideForkBoundaryMsgId).toBe('anchor');
  });

  it('renders nothing for types that can never be side children', () => {
    const { container } = render(
      <SideChildChat conversation={{ ...acpChild, type: 'gemini' } as unknown as TChatConversation} />
    );

    expect(container.firstElementChild).toBeNull();
    expect(acpChatMock).not.toHaveBeenCalled();
  });
});
