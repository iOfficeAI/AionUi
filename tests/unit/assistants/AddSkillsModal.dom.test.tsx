import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for AddSkillsModal component (A9 in N4a).
 * Shallow verification: smoke + props branches + callback spies.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import AddSkillsModal from '@/renderer/pages/settings/AssistantSettings/AddSkillsModal';

const renderWithProviders = (ui: React.ReactElement) => render(<ConfigProvider>{ui}</ConfigProvider>);

describe('AddSkillsModal', () => {
  const mockSkills = [
    { name: 'skill-a', path: '/a', description: 'Skill A' },
    { name: 'skill-b', path: '/b', description: 'Skill B' },
  ];

  const defaultProps = {
    visible: false,
    onCancel: vi.fn(),
    externalSources: [],
    activeSourceTab: '',
    setActiveSourceTab: vi.fn(),
    activeSource: undefined,
    filteredExternalSkills: mockSkills,
    externalSkillsLoading: false,
    searchExternalQuery: '',
    setSearchExternalQuery: vi.fn(),
    refreshing: false,
    handleRefreshExternal: vi.fn(),
    setShowAddPathModal: vi.fn(),
    customSkills: [],
    handleAddFoundSkills: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders without crashing when visible=true (smoke)', () => {
    const { container } = renderWithProviders(<AddSkillsModal {...defaultProps} visible={true} />);
    expect(container).toBeTruthy();
  });

  it('does not render when visible=false (props branch)', () => {
    const { container } = renderWithProviders(<AddSkillsModal {...defaultProps} />);
    expect(container.querySelector('.arco-modal')).not.toBeInTheDocument();
  });

  it('renders with empty filteredExternalSkills (props branch)', () => {
    const { container } = renderWithProviders(
      <AddSkillsModal {...defaultProps} visible={true} filteredExternalSkills={[]} />
    );
    expect(container).toBeTruthy();
  });

  it('handleAddFoundSkills is callable (callback spy)', () => {
    const handleAddSpy = vi.fn();
    renderWithProviders(<AddSkillsModal {...defaultProps} visible={true} handleAddFoundSkills={handleAddSpy} />);
    expect(handleAddSpy).not.toHaveBeenCalled(); // Not auto-triggered
  });

  it('setSearchExternalQuery is callable (callback spy)', () => {
    const setSearchSpy = vi.fn();
    renderWithProviders(<AddSkillsModal {...defaultProps} visible={true} setSearchExternalQuery={setSearchSpy} />);
    expect(setSearchSpy).not.toHaveBeenCalled(); // Not auto-triggered
  });

  it('renders with externalSkillsLoading=true (props branch)', () => {
    const { container } = renderWithProviders(
      <AddSkillsModal {...defaultProps} visible={true} externalSkillsLoading={true} />
    );
    expect(container).toBeTruthy();
  });
});
