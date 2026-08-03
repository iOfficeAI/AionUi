/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Representative English copy for the keys under test so the forbidden-phrase
// assertions are meaningful; every other key echoes so it stays assertable.
const COPY: Record<string, string> = {
  'common.backendStartup.pendingSlow.title': 'Starting up',
  'common.backendStartup.pendingSlow.description':
    "AionCore is starting up, please wait. If it doesn't respond after a while, you can quit and reopen the app.",
  'common.backendStartup.exited.title': "Startup didn't complete",
  'common.backendStartup.exited.description':
    'AionCore could not finish starting and has exited. Please restart the app; if this keeps happening, please send diagnostics.',
  'common.backendStartup.exited.sendDiagnostics': 'Send diagnostics',
  'common.backendStartup.incompleteInstallation.description':
    'Your installation is missing required local resources. Please download and reinstall the latest AionUi; if it persists after reinstalling, check whether antivirus quarantined AionCore.',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => COPY[key] ?? key,
    i18n: { language: 'en' },
  }),
}));

// Keep the installation-integrity module importable in jsdom without a real
// feedback pipeline.
vi.mock('@/renderer/services/feedback/submitFeedbackReport', () => ({
  submitFeedbackReport: vi.fn().mockResolvedValue(undefined),
}));

const FORBIDDEN_PHRASES = ['missing required local resources', 'reinstall', 'antivirus', 'quarantine'];

import BackendStartingView from '@/renderer/components/layout/BackendStartingView';
import {
  getBackendStartupInstallationDescription,
  getInstallationIntegrityModalActions,
  getInstallationIntegrityTitle,
} from '@/renderer/components/layout/InstallationIntegrityDialog';

const echoT = ((key: string) => key) as unknown as Parameters<typeof getInstallationIntegrityTitle>[0];

describe('AC-4: BackendStartingView (pending-slow, process alive)', () => {
  it('shows benign starting copy without any reinstall / antivirus / missing-resource wording', () => {
    render(<BackendStartingView />);

    const description = screen.getByTestId('backend-starting-description').textContent ?? '';
    expect(description.length).toBeGreaterThan(0);
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(description.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });

  it('renders no buttons (no report / download / restart / quit controls)', () => {
    render(<BackendStartingView />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByTestId('installation-integrity-report')).toBeNull();
    expect(screen.queryByTestId('installation-integrity-download')).toBeNull();
  });
});

describe('AC-5: backend_exited honest-failure wiring', () => {
  it('uses the exited title and keeps a report action but no download action', () => {
    expect(getInstallationIntegrityTitle(echoT, 'backend_exited')).toBe('common.backendStartup.exited.title');

    const actions = getInstallationIntegrityModalActions(echoT, { diagnosticsKind: 'backend_exited' });
    expect(actions.reportText).toBe('common.backendStartup.exited.sendDiagnostics');
    // No download / reinstall button for a process that was proven to exist.
    expect(actions.downloadText).toBeUndefined();
    expect(actions.recoverText).toBeUndefined();
  });

  it('regression: genuine incomplete-installation still keeps the reinstall copy and download action', () => {
    const description = getBackendStartupInstallationDescription(
      echoT as unknown as Parameters<typeof getBackendStartupInstallationDescription>[0]
    );
    expect(description).toBe('common.backendStartup.incompleteInstallation.description');

    const actions = getInstallationIntegrityModalActions(echoT, { diagnosticsKind: 'incomplete_installation' });
    expect(actions.downloadText).toBe('common.backendStartup.incompleteInstallation.downloadLatest');
  });
});
