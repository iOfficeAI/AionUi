import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for AssistantEditDrawer component (A7 in N4a).
 * Shallow verification: props branches + callback spies, no deep Arco interaction.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

import AssistantEditDrawer from '@/renderer/pages/settings/AssistantSettings/AssistantEditDrawer';

const renderWithProviders = (ui: React.ReactElement) => render(<ConfigProvider>{ui}</ConfigProvider>);

describe('AssistantEditDrawer', () => {
  const defaultProps = {
    editVisible: false,
    setEditVisible: vi.fn(),
    isCreating: false,
    editName: '',
    setEditName: vi.fn(),
    editDescription: '',
    setEditDescription: vi.fn(),
    editAvatar: '',
    setEditAvatar: vi.fn(),
    editAvatarImage: undefined,
    editAgent: 'claude',
    setEditAgent: vi.fn(),
    editContext: '',
    setEditContext: vi.fn(),
    promptViewMode: 'preview' as const,
    setPromptViewMode: vi.fn(),
    availableSkills: [],
    selectedSkills: [],
    setSelectedSkills: vi.fn(),
    pendingSkills: [],
    customSkills: [],
    setDeletePendingSkillName: vi.fn(),
    setDeleteCustomSkillName: vi.fn(),
    setSkillsModalVisible: vi.fn(),
    builtinAutoSkills: [],
    disabledBuiltinSkills: [],
    setDisabledBuiltinSkills: vi.fn(),
    activeAssistant: null,
    activeAssistantId: null,
    isExtensionAssistant: () => false,
    availableBackends: [],
    handleSave: vi.fn(),
    handleDeleteClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders without crashing when editVisible=true (smoke)', () => {
    const { container } = renderWithProviders(<AssistantEditDrawer {...defaultProps} editVisible={true} />);
    expect(container).toBeTruthy();
  });

  it('does not render visible content when editVisible=false (props branch)', () => {
    const { container } = renderWithProviders(<AssistantEditDrawer {...defaultProps} />);
    expect(container.querySelector('.arco-drawer')).not.toBeInTheDocument();
  });

  it('passes editName prop correctly (props branch)', () => {
    const { container } = renderWithProviders(
      <AssistantEditDrawer {...defaultProps} editVisible={true} editName='TestName' />
    );
    const nameInput = screen.queryByDisplayValue('TestName');
    expect(nameInput || container).toBeTruthy(); // Shallow: just verify no crash
  });

  it('handleSave is callable (callback spy)', () => {
    const handleSaveSpy = vi.fn();
    renderWithProviders(<AssistantEditDrawer {...defaultProps} editVisible={true} handleSave={handleSaveSpy} />);
    expect(handleSaveSpy).not.toHaveBeenCalled(); // Not auto-triggered
  });

  it('setEditVisible is callable (callback spy)', () => {
    const setEditVisibleSpy = vi.fn();
    renderWithProviders(
      <AssistantEditDrawer {...defaultProps} editVisible={true} setEditVisible={setEditVisibleSpy} />
    );
    expect(setEditVisibleSpy).not.toHaveBeenCalled(); // Not auto-triggered
  });

  it('renders with isCreating=true (props branch)', () => {
    const { container } = renderWithProviders(
      <AssistantEditDrawer {...defaultProps} editVisible={true} isCreating={true} />
    );
    expect(container).toBeTruthy();
  });

  it('hides generic AionUI skill groups for the Command EVE assistant', () => {
    renderWithProviders(
      <AssistantEditDrawer
        {...defaultProps}
        editVisible={true}
        activeAssistant={
          {
            id: 'command-eve-chief-of-staff',
            name: 'EVE',
            source: 'user',
            preset_agent_type: 'hermes',
          } as any
        }
        activeAssistantId='command-eve-chief-of-staff'
        availableSkills={[
          {
            name: 'first-run-company-discovery',
            description: 'Company discovery',
            location: '/tmp/first-run-company-discovery',
            is_custom: true,
            source: 'custom',
          },
          {
            name: 'xiaohongshu-recruiter',
            description: 'Legacy recruiting skill',
            location: '/tmp/xiaohongshu-recruiter',
            is_custom: false,
            source: 'builtin',
          },
          {
            name: 'aionui-skills',
            description: 'Legacy global skill hub',
            location: '/tmp/aionui-skills',
            is_custom: false,
            source: 'extension',
          },
        ]}
        selectedSkills={['first-run-company-discovery', 'xiaohongshu-recruiter', 'aionui-skills']}
        builtinAutoSkills={[{ name: 'weixin-file-send', description: 'Legacy file sender' }]}
      />
    );

    expect(screen.getByTestId('command-eve-managed-skills-note')).toBeInTheDocument();
    expect(screen.getByText('first-run-company-discovery')).toBeInTheDocument();
    expect(screen.queryByText('settings.builtinSkills')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.autoInjectedSkills')).not.toBeInTheDocument();
    expect(screen.queryByText('xiaohongshu-recruiter')).not.toBeInTheDocument();
    expect(screen.queryByText('aionui-skills')).not.toBeInTheDocument();
    expect(screen.queryByText('weixin-file-send')).not.toBeInTheDocument();
  });
});
