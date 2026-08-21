/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useSWRMock = vi.fn();
const usePresetAssistantInfoMock = vi.fn();
const getConversationOrNullMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('swr', () => ({
  __esModule: true,
  default: (...args: unknown[]) => useSWRMock(...args),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: (...args: unknown[]) => usePresetAssistantInfoMock(...args),
}));

vi.mock('@renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: (...args: unknown[]) => usePresetAssistantInfoMock(...args),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: (...args: unknown[]) => getConversationOrNullMock(...args),
}));

vi.mock('@renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
  resolveAgentLogo: () => null,
  resolveAgentAvatar: () => ({ kind: 'fallback' }),
}));

import SingleChatEmptyState from '@/renderer/pages/conversation/components/SingleChatEmptyState';

describe('SingleChatEmptyState', () => {
  beforeEach(() => {
    useSWRMock.mockReset();
    usePresetAssistantInfoMock.mockReset();
    getConversationOrNullMock.mockReset();
  });

  it('renders the greeting once the conversation record is available', () => {
    useSWRMock.mockReturnValue({
      data: { id: 'conv-1', type: 'acp', name: 'Some chat title', extra: { backend: 'claude' } },
    });
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(<SingleChatEmptyState conversation_id='conv-1' />);

    expect(screen.getByTestId('single-chat-empty-state-greeting')).toHaveTextContent(
      'conversation.emptyState.greeting'
    );
  });

  it('prefers the explicit assistant_name prop over legacy runtime extra metadata', () => {
    useSWRMock.mockReturnValue({
      data: {
        id: 'conv-1',
        type: 'acp',
        name: 'Some chat title',
        extra: { agent_name: 'Legacy Runtime Name', backend: 'claude' },
      },
    });
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(<SingleChatEmptyState conversation_id='conv-1' assistant_name='Assistant Prop Name' />);

    expect(screen.getByText('Assistant Prop Name')).toBeInTheDocument();
    expect(screen.queryByText('Legacy Runtime Name')).not.toBeInTheDocument();
  });

  it('falls back to legacy extra.agent_name when no preset/prop name is given', () => {
    useSWRMock.mockReturnValue({
      data: {
        id: 'conv-1',
        type: 'acp',
        name: 'Some chat title',
        extra: { agent_name: 'Legacy Runtime Name', backend: 'claude' },
      },
    });
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(<SingleChatEmptyState conversation_id='conv-1' />);

    expect(screen.getByText('Legacy Runtime Name')).toBeInTheDocument();
    // The chat title is a summary of the first message, never the assistant identity.
    expect(screen.queryByText('Some chat title')).not.toBeInTheDocument();
  });

  it('uses the generic AI Assistant fallback when nothing else resolves', () => {
    useSWRMock.mockReturnValue({
      data: { id: 'conv-1', type: 'acp', name: 'Some chat title', extra: { backend: 'claude' } },
    });
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(<SingleChatEmptyState conversation_id='conv-1' />);

    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
  });

  it('renders nothing until the conversation record loads', () => {
    useSWRMock.mockReturnValue({ data: undefined });
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    const { container } = render(<SingleChatEmptyState conversation_id='conv-1' />);

    expect(container).toBeEmptyDOMElement();
  });
});
