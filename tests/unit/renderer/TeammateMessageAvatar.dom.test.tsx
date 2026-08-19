/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

const { usePresetAssistantInfoMock, useSWRMock, getConversationOrNullMock } = vi.hoisted(() => ({
  usePresetAssistantInfoMock: vi.fn(),
  useSWRMock: vi.fn(),
  getConversationOrNullMock: vi.fn(),
}));

vi.mock('swr', () => ({
  __esModule: true,
  default: (...args: unknown[]) => useSWRMock(...args),
}));

vi.mock('@renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: (...args: unknown[]) => usePresetAssistantInfoMock(...args),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: (...args: unknown[]) => getConversationOrNullMock(...args),
}));

vi.mock('@icon-park/react', () => ({
  Robot: ({ size, className }: { size?: number; className?: string }) => (
    <span data-testid='robot-fallback' className={className} data-size={size} />
  ),
}));

// Stub fetch to avoid network calls from ThemedLogo's detection
vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve('<svg></svg>') }))
);

import TeammateMessageAvatar from '@/renderer/pages/conversation/Messages/components/TeammateMessageAvatar';

describe('TeammateMessageAvatar', () => {
  it('renders preset assistant logo as ThemedLogo image when isEmoji is false', async () => {
    useSWRMock.mockReturnValue({ data: { id: 'conv-1' } });
    usePresetAssistantInfoMock.mockReturnValue({
      info: {
        name: 'Claude Code',
        logo: 'http://127.0.0.1:1/api/assets/logos/ai-major/claude.svg',
        isEmoji: false,
        backend: 'claude',
      },
    });
    getConversationOrNullMock.mockResolvedValue(undefined);

    const { container } = render(<TeammateMessageAvatar senderName='Claude' senderConversationId='conv-1' />);

    // Wait for ThemedLogo detection fetch to settle
    await act(async () => {
      await Promise.resolve();
    });

    // Non-tintable SVG (no currentColor in stub) → renders as <img>
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('Claude Code');
  });

  it('renders emoji preset without ThemedLogo', () => {
    useSWRMock.mockReturnValue({ data: { id: 'conv-2' } });
    usePresetAssistantInfoMock.mockReturnValue({
      info: { name: 'Writer', logo: '✍️', isEmoji: true, backend: 'claude' },
    });
    getConversationOrNullMock.mockResolvedValue(undefined);

    render(<TeammateMessageAvatar senderName='Writer' senderConversationId='conv-2' />);
    expect(screen.getByText('✍️')).toBeInTheDocument();
  });
});
