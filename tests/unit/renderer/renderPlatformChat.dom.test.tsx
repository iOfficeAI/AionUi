/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  default: function AcpChatMock() {
    return null;
  },
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsPlatformChat', () => ({
  default: function AionrsPlatformChatMock() {
    return null;
  },
}));

import { renderPlatformChat } from '@/renderer/pages/conversation/components/renderPlatformChat';

function conversation(type: TChatConversation['type'], extra: TChatConversation['extra'] = {}): TChatConversation {
  return {
    id: `${type}-1`,
    type,
    name: type,
    created_at: 1,
    modified_at: 1,
    model: { id: 'm', platform: 'openai', name: 'gpt', base_url: '', api_key: '', use_model: 'gpt' },
    extra,
  } as TChatConversation;
}

function elementProps(node: React.ReactNode) {
  expect(React.isValidElement(node)).toBe(true);
  return (node as React.ReactElement<Record<string, unknown>>).props;
}

function elementName(node: React.ReactNode): string {
  expect(React.isValidElement(node)).toBe(true);
  return ((node as React.ReactElement).type as { name?: string }).name ?? '';
}

describe('renderPlatformChat', () => {
  it('routes ACP-style conversations with side composer options', () => {
    const composerPrefix = <div data-testid='prefix' />;
    const node = renderPlatformChat({
      conversation: conversation('acp', {
        workspace: '/w',
        backend: 'codex',
        session_mode: 'continue',
        cron_job_id: 'cron-1',
        skills: ['s1'],
        mcp_servers: ['mcp-1'],
        mcp_statuses: [{ name: 'mcp-1', status: 'connected' }],
        side_mode: true,
      }),
      assistantDisplayName: 'Agent',
      hideSendBox: true,
      composerPrefix,
    });

    expect(elementName(node)).toBe('AcpChatMock');
    expect(elementProps(node)).toMatchObject({
      conversation_id: 'acp-1',
      workspace: '/w',
      backend: 'codex',
      session_mode: 'continue',
      agent_name: 'Agent',
      cron_job_id: 'cron-1',
      hideSendBox: true,
      isSideMode: true,
      composerPrefix,
      loadedSkills: ['s1'],
      loadedMcpServers: ['mcp-1'],
      loadedMcpStatuses: [{ name: 'mcp-1', status: 'connected' }],
    });
  });

  it('uses the persisted assistant identity when the side dock provides no overrides', () => {
    const acpConversation = conversation('acp', { workspace: '/w', backend: 'claude', side_mode: true });
    acpConversation.assistant = {
      id: 'assistant-1',
      source: 'builtin',
      name: 'Research Assistant',
      avatar: '',
      backend: 'opencode',
    };

    const node = renderPlatformChat({ conversation: acpConversation });

    expect(elementProps(node)).toMatchObject({
      backend: 'opencode',
      agent_name: 'Research Assistant',
      assistantId: 'assistant-1',
      isSideMode: true,
    });
  });

  it('returns null for legacy read-only platform types', () => {
    for (const type of ['codex', 'gemini', 'openclaw-gateway', 'nanobot', 'remote'] as const) {
      expect(renderPlatformChat({ conversation: conversation(type, { workspace: '/legacy' }) })).toBeNull();
    }
  });

  it('routes aionrs only when a workspace is available', () => {
    const composerPrefix = <span />;
    const aionrsConversation = conversation('aionrs', { workspace: '/a', side_mode: true });
    aionrsConversation.assistant = {
      id: 'assistant-2',
      source: 'user',
      name: 'Writing Assistant',
      avatar: '',
      backend: 'aionrs',
    };
    const aionrs = renderPlatformChat({
      conversation: aionrsConversation,
      composerPrefix,
    });

    expect(elementName(aionrs)).toBe('AionrsPlatformChatMock');
    expect(elementProps(aionrs)).toMatchObject({
      conversation: expect.objectContaining({ id: 'aionrs-1' }),
      assistantDisplayName: 'Writing Assistant',
      assistantId: 'assistant-2',
      isSideMode: true,
      composerPrefix,
    });
    expect(renderPlatformChat({ conversation: conversation('aionrs') })).toBeNull();
  });

  it('returns null for unknown conversation types', () => {
    expect(renderPlatformChat({ conversation: conversation('unknown' as TChatConversation['type']) })).toBeNull();
  });
});
