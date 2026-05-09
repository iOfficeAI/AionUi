import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for SkillConfirmModals component (A10 in N4a).
 * Shallow verification: renders without crashing + callback spies.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      useMessage: () => [{ success: vi.fn(), error: vi.fn() }],
    },
  };
});

import SkillConfirmModals from '@/renderer/pages/settings/AssistantSettings/SkillConfirmModals';

const renderWithProviders = (ui: React.ReactElement) => render(<ConfigProvider>{ui}</ConfigProvider>);

describe('SkillConfirmModals', () => {
  const mockMessage = { success: vi.fn(), error: vi.fn() };

  const defaultProps = {
    deletePendingSkillName: null as string | null,
    setDeletePendingSkillName: vi.fn(),
    pendingSkills: [],
    setPendingSkills: vi.fn(),
    deleteCustomSkillName: null as string | null,
    setDeleteCustomSkillName: vi.fn(),
    customSkills: [],
    setCustomSkills: vi.fn(),
    selectedSkills: [],
    setSelectedSkills: vi.fn(),
    message: mockMessage,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders without crashing when deletePendingSkillName is set (smoke)', () => {
    const { container } = renderWithProviders(
      <SkillConfirmModals {...defaultProps} deletePendingSkillName='skill-x' />
    );
    expect(container).toBeTruthy();
  });

  it('renders without crashing when deleteCustomSkillName is set (smoke)', () => {
    const { container } = renderWithProviders(
      <SkillConfirmModals {...defaultProps} deleteCustomSkillName='custom-skill' />
    );
    expect(container).toBeTruthy();
  });

  it('renders without crashing when both names are null (props branch)', () => {
    const { container } = renderWithProviders(<SkillConfirmModals {...defaultProps} />);
    expect(container).toBeTruthy();
  });

  it('setPendingSkills is callable (callback spy)', () => {
    const setPendingSpy = vi.fn();
    renderWithProviders(
      <SkillConfirmModals {...defaultProps} deletePendingSkillName='skill-x' setPendingSkills={setPendingSpy} />
    );
    expect(setPendingSpy).not.toHaveBeenCalled(); // Not auto-triggered
  });

  it('setCustomSkills is callable (callback spy)', () => {
    const setCustomSpy = vi.fn();
    renderWithProviders(
      <SkillConfirmModals {...defaultProps} deleteCustomSkillName='custom-skill' setCustomSkills={setCustomSpy} />
    );
    expect(setCustomSpy).not.toHaveBeenCalled(); // Not auto-triggered
  });

  it('setDeletePendingSkillName is callable (callback spy)', () => {
    const setDeletePendingSpy = vi.fn();
    renderWithProviders(
      <SkillConfirmModals
        {...defaultProps}
        deletePendingSkillName='skill-x'
        setDeletePendingSkillName={setDeletePendingSpy}
      />
    );
    expect(setDeletePendingSpy).not.toHaveBeenCalled(); // Not auto-triggered
  });
});
