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
    "CSBU WorkMate backend is starting up, please wait. If it doesn't respond after a while, you can quit and reopen the app.",
  'common.backendStartup.exited.title': "Startup didn't complete",
  'common.backendStartup.exited.description':
    "CSBU WorkMate backend couldn't finish starting and has exited. Please restart the app; if this keeps happening, please send diagnostics.",
  'common.backendStartup.exited.sendDiagnostics': 'Send diagnostics',
  'common.backendStartup.incompleteInstallation.description':
    'Your installation is missing required local resources. Please download and reinstall the latest CSBU WorkMate; if it persists after reinstalling, check whether antivirus quarantined CSBU WorkMate backend.',
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

const FORBIDDEN_PHRASES = ['AionCore', 'missing required local resources', 'reinstall', 'antivirus', 'quarantine'];

import BackendStartingView from '@/renderer/components/layout/BackendStartingView';
import {
  getBackendStartupInstallationDescription,
  getInstallationIntegrityDiagnosticsSentText,
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

  it('regression: genuine incomplete-installation still keeps the reinstall guidance', () => {
    const description = getBackendStartupInstallationDescription(
      echoT as unknown as Parameters<typeof getBackendStartupInstallationDescription>[0]
    );
    expect(description).toBe('common.backendStartup.incompleteInstallation.description');

    const actions = getInstallationIntegrityModalActions(echoT, { diagnosticsKind: 'incomplete_installation' });
    // WorkMate keeps recovery guidance in-product and does not expose the
    // upstream public download action.
    expect(actions.downloadText).toBeUndefined();
  });
});

// Sentry 136646113 — dedicated port-report-timeout kind plus the neutralized
// startup_failed fallback kind. Neither may expose the download/reinstall path.
describe('port_report_timeout and startup_failed dialog wiring (Sentry 136646113)', () => {
  it('uses the port-report-timeout copy with a report action but no download action', () => {
    expect(getInstallationIntegrityTitle(echoT, 'port_report_timeout')).toBe(
      'common.backendStartup.portReportTimeout.title'
    );
    expect(getInstallationIntegrityDiagnosticsSentText(echoT, 'port_report_timeout')).toBe(
      'common.backendStartup.portReportTimeout.diagnosticsSent'
    );

    const actions = getInstallationIntegrityModalActions(echoT, { diagnosticsKind: 'port_report_timeout' });
    expect(actions.reportText).toBe('common.backendStartup.portReportTimeout.sendDiagnostics');
    expect(actions.downloadText).toBeUndefined();
    expect(actions.recoverText).toBeUndefined();
  });

  it('uses the neutral startup-failed copy for the fallback kind, with no download action', () => {
    expect(getInstallationIntegrityTitle(echoT, 'startup_failed')).toBe('common.backendStartup.startupFailed.title');
    expect(getInstallationIntegrityDiagnosticsSentText(echoT, 'startup_failed')).toBe(
      'common.backendStartup.startupFailed.diagnosticsSent'
    );

    const actions = getInstallationIntegrityModalActions(echoT, { diagnosticsKind: 'startup_failed' });
    expect(actions.reportText).toBe('common.backendStartup.startupFailed.sendDiagnostics');
    expect(actions.downloadText).toBeUndefined();
    expect(actions.recoverText).toBeUndefined();
  });

  it('keeps incomplete-installation recovery guidance in-product without a public download action', () => {
    expect(getInstallationIntegrityTitle(echoT, 'incomplete_installation')).toBe(
      'common.backendStartup.incompleteInstallation.title'
    );

    const actions = getInstallationIntegrityModalActions(echoT, { diagnosticsKind: 'incomplete_installation' });
    expect(actions.downloadText).toBeUndefined();
  });
});
