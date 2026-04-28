/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import ConversationSkillsIndicator from '@/renderer/pages/conversation/components/ConversationSkillsIndicator';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: {
        invoke: vi.fn().mockResolvedValue([
          { name: 'cron', description: 'Schedule stuff', location: '', is_custom: false, source: 'builtin' },
          { name: 'pdf', description: 'Render PDFs', location: '', is_custom: false, source: 'builtin' },
        ]),
      },
    },
  },
}));

const createConversation = (skills?: string[]): TChatConversation =>
  ({
    id: 'c1',
    name: 'test',
    type: 'acp',
    model: {} as never,
    extra: skills !== undefined ? { skills } : {},
    created_at: 0,
    modified_at: 0,
  }) as unknown as TChatConversation;

function renderIndicator(conversation: TChatConversation | undefined) {
  return render(
    <MemoryRouter>
      <SWRConfig value={{ provider: () => new Map() }}>
        <ConversationSkillsIndicator conversation={conversation} />
      </SWRConfig>
    </MemoryRouter>
  );
}

describe('ConversationSkillsIndicator', () => {
  it('returns null when conversation is undefined', () => {
    const { container } = renderIndicator(undefined);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when skills is an empty array', () => {
    const { container } = renderIndicator(createConversation([]));
    expect(container.firstChild).toBeNull();
  });

  it('returns null when skills is missing from extra', () => {
    const { container } = renderIndicator(createConversation());
    expect(container.firstChild).toBeNull();
  });

  it('renders count when skills is non-empty', async () => {
    renderIndicator(createConversation(['cron', 'pdf']));
    const count = await screen.findByTestId('skills-indicator-count');
    expect(count.textContent).toBe('2');
  });
});
