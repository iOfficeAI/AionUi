/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// AgentLogoIcon lives in AgentBadge but is a named export consumed by
// AgentModeSelector, MobileConversationBrand, and ChatLayout.
import { AgentLogoIcon } from '@/renderer/components/agent/AgentBadge';
import ThemedLogo from '@/renderer/components/agent/ThemedLogo';

const { useAgentLogosMock } = vi.hoisted(() => ({
  useAgentLogosMock: vi.fn(),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: (...args: unknown[]) => useAgentLogosMock(...args),
  resolveAgentLogo: (_logos: unknown, opts: { backend?: string | null }) =>
    opts.backend ? `http://127.0.0.1:1/api/assets/logos/ai-major/${opts.backend}.svg` : null,
}));

vi.mock('@icon-park/react', () => ({
  Robot: ({ className, fill }: { className?: string; fill?: string; size?: number }) => (
    <span data-testid='robot-fallback' className={className} data-fill={fill} />
  ),
}));

describe('AgentLogoIcon', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve('<svg></svg>') }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('passes backend logo through ThemedLogo when resolved', async () => {
    useAgentLogosMock.mockReturnValue({});

    const { container } = render(<AgentLogoIcon backend='openai' />);

    // Wait for ThemedLogo's detection fetch to settle
    await act(async () => {
      await Promise.resolve();
    });

    // Non-tintable SVG (no currentColor in stub) → renders as <img>
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('openai logo');
    expect(img?.getAttribute('src')).toContain('openai.svg');
  });

  it('renders emoji when agentLogoIsEmoji is set', () => {
    useAgentLogosMock.mockReturnValue({});

    render(<AgentLogoIcon agentLogo='🤖' agentLogoIsEmoji />);

    expect(screen.getByText('🤖')).toBeInTheDocument();
  });

  it('renders the Robot fallback when no logo or backend is available', () => {
    useAgentLogosMock.mockReturnValue({});

    render(<AgentLogoIcon />);

    expect(screen.getByTestId('robot-fallback')).toBeInTheDocument();
  });

  it('renders fallback when agentLogoIsFallback is set', () => {
    useAgentLogosMock.mockReturnValue({});

    render(<AgentLogoIcon agentLogoIsFallback />);

    expect(screen.getByTestId('robot-fallback')).toBeInTheDocument();
  });
});
