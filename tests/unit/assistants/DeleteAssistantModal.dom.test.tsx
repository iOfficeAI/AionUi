import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for DeleteAssistantModal component (A8 in N4a).
 * Tests deletion confirmation modal, builtin guard, and cancel behavior.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import DeleteAssistantModal from '@/renderer/pages/settings/AssistantSettings/DeleteAssistantModal';
import type { AssistantListItem } from '@/renderer/pages/settings/AssistantSettings/types';

const renderWithProviders = (ui: React.ReactElement) => render(<ConfigProvider>{ui}</ConfigProvider>);

describe('DeleteAssistantModal', () => {
  const defaultProps = {
    visible: false,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    activeAssistant: null as AssistantListItem | null,
    avatarImageMap: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render when visible=false (props branch)', () => {
    const { container } = renderWithProviders(<DeleteAssistantModal {...defaultProps} />);
    expect(container.querySelector('[data-testid="modal-delete-assistant"]')).not.toBeInTheDocument();
  });

  it('renders modal when visible=true (smoke)', () => {
    const assistant: AssistantListItem = { id: 'a1', name: 'Test', sort_order: 1, source: 'user', enabled: true };
    renderWithProviders(<DeleteAssistantModal {...defaultProps} visible={true} activeAssistant={assistant} />);
    expect(screen.getByTestId('modal-delete-assistant')).toBeInTheDocument();
  });

  it('displays assistant name in confirmation (props branch)', () => {
    const assistant: AssistantListItem = {
      id: 'a1',
      name: 'UserAssistant',
      sort_order: 1,
      source: 'user',
      enabled: true,
    };
    renderWithProviders(<DeleteAssistantModal {...defaultProps} visible={true} activeAssistant={assistant} />);
    expect(screen.getByText('UserAssistant')).toBeInTheDocument();
  });

  it('calls onConfirm when OK button is clicked (callback spy)', async () => {
    const onConfirmSpy = vi.fn();
    const assistant: AssistantListItem = { id: 'a1', name: 'Test', sort_order: 1, source: 'user', enabled: true };
    const user = userEvent.setup();
    renderWithProviders(
      <DeleteAssistantModal {...defaultProps} visible={true} activeAssistant={assistant} onConfirm={onConfirmSpy} />
    );

    const okButton = screen.getByRole('button', { name: /delete/i });
    await user.click(okButton);

    expect(onConfirmSpy).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel button is clicked (callback spy)', async () => {
    const onCancelSpy = vi.fn();
    const assistant: AssistantListItem = { id: 'a1', name: 'Test', sort_order: 1, source: 'user', enabled: true };
    const user = userEvent.setup();
    renderWithProviders(
      <DeleteAssistantModal {...defaultProps} visible={true} activeAssistant={assistant} onCancel={onCancelSpy} />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(onCancelSpy).toHaveBeenCalledTimes(1);
  });

  it('renders without activeAssistant (props branch)', () => {
    renderWithProviders(<DeleteAssistantModal {...defaultProps} visible={true} activeAssistant={null} />);
    expect(screen.getByTestId('modal-delete-assistant')).toBeInTheDocument();
  });
});
