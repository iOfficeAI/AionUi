/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollaborationLauncher } from '@/renderer/pages/conversation/components/AdHocTeam/CollaborationLauncher';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', fontScale: 1 }),
}));

vi.mock('@/renderer/pages/team/hooks/useTeamAssistantOptions', () => ({
  useTeamAssistantOptions: () => ({
    assistants: [
      { id: 'a1', name: 'Assistant One' },
      { id: 'a2', name: 'Assistant Two' },
    ],
    loading: false,
    error: null,
  }),
}));

const createMock = vi.fn();

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      ...actual.Message,
      success: (...args: unknown[]) => messageSuccessMock(...args),
      error: (...args: unknown[]) => messageErrorMock(...args),
    },
  };
});

const messageErrorMock = vi.fn();
const messageSuccessMock = vi.fn();

const resetMessageMocks = () => {
  messageErrorMock.mockClear();
  messageSuccessMock.mockClear();
};

describe('CollaborationLauncher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMessageMocks();
    createMock.mockResolvedValue({ team_id: 'team-1' });
  });

  it('renders the collaboration trigger button', () => {
    render(
      <CollaborationLauncher
        conversationId='conv-1'
        userId='user-1'
        onCreated={vi.fn()}
        create={createMock}
        isCreating={false}
      />
    );
    expect(screen.getByTestId('collaboration-launcher-trigger')).toBeInTheDocument();
  });

  it('opens the agent selector modal when the trigger is clicked', () => {
    render(
      <CollaborationLauncher
        conversationId='conv-1'
        userId='user-1'
        onCreated={vi.fn()}
        create={createMock}
        isCreating={false}
      />
    );
    fireEvent.click(screen.getByTestId('collaboration-launcher-trigger'));
    expect(screen.getByTestId('agent-selector-modal')).toBeInTheDocument();
  });

  it('calls create with the selected assistant and invokes onCreated', async () => {
    const onCreated = vi.fn();
    render(
      <CollaborationLauncher
        conversationId='conv-1'
        userId='user-1'
        onCreated={onCreated}
        create={createMock}
        isCreating={false}
      />
    );
    fireEvent.click(screen.getByTestId('collaboration-launcher-trigger'));
    fireEvent.click(screen.getByTestId('agent-selector-option-a2'));
    fireEvent.click(screen.getByTestId('agent-selector-confirm'));
    await waitFor(() => expect(createMock).toHaveBeenCalledWith('a2'));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ team_id: 'team-1' })));
  });

  it('passes selected assistant details in the create result so callers can show a named success message', async () => {
    createMock.mockResolvedValue({
      team_id: 'team-1',
      origin_conversation_id: 'conv-1',
      leader_slot_id: 'slot-lead',
      target_slot_id: 'slot-target',
      created: true,
    });
    const onCreated = vi.fn();
    render(
      <CollaborationLauncher
        conversationId='conv-1'
        userId='user-1'
        onCreated={onCreated}
        create={createMock}
        isCreating={false}
      />
    );
    fireEvent.click(screen.getByTestId('collaboration-launcher-trigger'));
    fireEvent.click(screen.getByTestId('agent-selector-option-a2'));
    fireEvent.click(screen.getByTestId('agent-selector-confirm'));
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          team_id: 'team-1',
          target_assistant_id: 'a2',
          target_assistant_name: 'Assistant Two',
        })
      )
    );
  });

  it('shows an i18n error message and keeps the modal open when creation fails', async () => {
    createMock.mockRejectedValue(new Error('network failure'));
    render(
      <CollaborationLauncher
        conversationId='conv-1'
        userId='user-1'
        onCreated={vi.fn()}
        create={createMock}
        isCreating={false}
      />
    );
    fireEvent.click(screen.getByTestId('collaboration-launcher-trigger'));
    fireEvent.click(screen.getByTestId('agent-selector-option-a1'));
    fireEvent.click(screen.getByTestId('agent-selector-confirm'));
    await waitFor(() => expect(messageErrorMock).toHaveBeenCalledWith('conversation.collaboration.createFailed'));
    expect(screen.getByTestId('agent-selector-modal')).toBeVisible();
  });

  it('disables the confirm button and shows loading while creating', async () => {
    let resolveCreate: (value: { team_id: string }) => void = () => {};
    createMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );
    render(
      <CollaborationLauncher
        conversationId='conv-1'
        userId='user-1'
        onCreated={vi.fn()}
        create={createMock}
        isCreating={false}
      />
    );
    fireEvent.click(screen.getByTestId('collaboration-launcher-trigger'));
    fireEvent.click(screen.getByTestId('agent-selector-option-a1'));
    const confirmButton = screen.getByTestId('agent-selector-confirm');
    fireEvent.click(confirmButton);
    await waitFor(() => expect(confirmButton).toBeDisabled());
    await waitFor(() => expect(confirmButton.querySelector('.arco-icon-loading')).toBeInTheDocument());
    resolveCreate({ team_id: 'team-1' });
    await waitFor(() => expect(screen.getByTestId('agent-selector-modal')).not.toBeVisible());
  });

  it('closes the modal when creation succeeds', async () => {
    render(
      <CollaborationLauncher
        conversationId='conv-1'
        userId='user-1'
        onCreated={vi.fn()}
        create={createMock}
        isCreating={false}
      />
    );
    fireEvent.click(screen.getByTestId('collaboration-launcher-trigger'));
    fireEvent.click(screen.getByTestId('agent-selector-option-a1'));
    fireEvent.click(screen.getByTestId('agent-selector-confirm'));
    await waitFor(() => expect(screen.getByTestId('agent-selector-modal')).not.toBeVisible());
  });

  it('does nothing when confirming without an injected create handler', async () => {
    const onCreated = vi.fn();
    render(<CollaborationLauncher conversationId='conv-1' userId='user-1' onCreated={onCreated} isCreating={false} />);
    fireEvent.click(screen.getByTestId('collaboration-launcher-trigger'));
    fireEvent.click(screen.getByTestId('agent-selector-option-a1'));
    fireEvent.click(screen.getByTestId('agent-selector-confirm'));

    await waitFor(() => expect(createMock).not.toHaveBeenCalled());
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('keeps the modal open when cancelling while creation is in flight', async () => {
    createMock.mockImplementation(() => new Promise(() => {}));
    render(
      <CollaborationLauncher
        conversationId='conv-1'
        userId='user-1'
        onCreated={vi.fn()}
        create={createMock}
        isCreating={false}
      />
    );
    fireEvent.click(screen.getByTestId('collaboration-launcher-trigger'));
    fireEvent.click(screen.getByTestId('agent-selector-option-a1'));
    fireEvent.click(screen.getByTestId('agent-selector-confirm'));
    await waitFor(() => expect(screen.getByTestId('agent-selector-confirm')).toBeDisabled());

    fireEvent.click(screen.getByTestId('agent-selector-cancel'));
    expect(screen.getByTestId('agent-selector-modal')).toBeVisible();
  });

  it('disables the trigger while a team is being created', () => {
    render(
      <CollaborationLauncher
        conversationId='conv-1'
        userId='user-1'
        onCreated={vi.fn()}
        create={createMock}
        isCreating
      />
    );
    expect(screen.getByTestId('collaboration-launcher-trigger')).toBeDisabled();
  });

  it('does not call create when the injected create prop is undefined', async () => {
    render(<CollaborationLauncher conversationId='conv-1' userId='user-1' onCreated={vi.fn()} />);
    fireEvent.click(screen.getByTestId('collaboration-launcher-trigger'));
    await waitFor(() => expect(screen.getByTestId('agent-selector-option-a1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('agent-selector-option-a1'));
    fireEvent.click(screen.getByTestId('agent-selector-confirm'));

    await waitFor(() => expect(messageErrorMock).not.toHaveBeenCalled());
    expect(screen.getByTestId('agent-selector-modal')).toBeVisible();
  });
});
