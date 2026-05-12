import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import AboutModalContent from '../../src/renderer/components/settings/SettingsModal/contents/AboutModalContent';

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: vi.fn(() => true),
  openExternalUrl: vi.fn(),
}));

vi.mock('../../src/renderer/components/settings/settingsViewContext', () => ({
  useSettingsViewMode: vi.fn(() => 'modal'),
}));

vi.mock('../../src/renderer/components/settings/SettingsModal/contents/FeedbackReportModal', () => ({
  default: () => <div data-testid='feedback-modal' />,
}));

describe('AboutModalContent', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('renders GIT_COMMIT_HASH when it is set', () => {
    process.env.GIT_COMMIT_HASH = '1234567';
    render(<AboutModalContent />);
    expect(screen.getByText('1234567')).toBeTruthy();
  });

  it('does not render GIT_COMMIT_HASH when it is unknown', () => {
    process.env.GIT_COMMIT_HASH = 'unknown';
    render(<AboutModalContent />);
    expect(screen.queryByText('unknown')).toBeNull();
  });
});
