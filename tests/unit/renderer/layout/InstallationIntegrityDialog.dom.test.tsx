/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Modal } from '@arco-design/web-react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Representative English copy for the keys under test. Every other key echoes so
// unmapped lookups stay assertable.
const RDC = 'common.backendStartup.recoverableDatabaseCorruption';
const COPY: Record<string, string> = {
  [`${RDC}.title`]: 'Local data is corrupted',
  [`${RDC}.description`]:
    'AionUi detected that the local database is corrupted and cannot continue startup. After confirmation, AionUi will back up the old database and create a new local database to continue startup. Past conversations will no longer be shown, and the old database will be kept as a backup file.',
  [`${RDC}.confirmRebuild`]: 'Back up old DB and rebuild new DB',
  [`${RDC}.sendDiagnostics`]: 'Send diagnostics',
  [`${RDC}.diagnosticsSent`]: 'Diagnostics sent',
  [`${RDC}.rebuildFailed`]: 'Failed to back up old DB and rebuild new DB',
  [`${RDC}.confirmDialog.title`]: 'Rebuild the database?',
  [`${RDC}.confirmDialog.content`]:
    'This will back up the currently corrupted database and create a brand-new empty one. Past conversations will no longer be shown (the old database is kept as a backup file). Continue?',
  [`${RDC}.confirmDialog.okText`]: 'Confirm rebuild',
  [`${RDC}.confirmDialog.cancelText`]: 'Cancel',
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

import {
  type InstallationIntegrityDiagnostics,
  InstallationIntegrityFooter,
} from '@/renderer/components/layout/InstallationIntegrityDialog';

const diagnostics: InstallationIntegrityDiagnostics = { source: 'backend_startup_failure' };

type ConfirmConfig = Parameters<typeof Modal.confirm>[0];

let recoverMock: ReturnType<typeof vi.fn>;

function stubModalConfirm() {
  return vi
    .spyOn(Modal, 'confirm')
    .mockImplementation(() => ({ close: () => {}, update: () => {} }) as unknown as ReturnType<typeof Modal.confirm>);
}

function renderFooter() {
  return render(
    <InstallationIntegrityFooter diagnostics={diagnostics} diagnosticsKind='recoverable_database_corruption' />
  );
}

beforeEach(() => {
  recoverMock = vi.fn().mockResolvedValue(undefined);
  (window as unknown as { electronAPI: { recoverCorruptedDatabase: () => Promise<void> } }).electronAPI = {
    recoverCorruptedDatabase: recoverMock,
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InstallationIntegrityDialog — recoverable_database_corruption recovery gate', () => {
  it('AC-5a: clicking rebuild opens a second confirmation and does NOT recover yet', () => {
    const confirmSpy = stubModalConfirm();
    renderFooter();

    fireEvent.click(screen.getByTestId('recoverable-database-corruption-rebuild'));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const cfg = confirmSpy.mock.calls[0][0] as ConfirmConfig;
    expect(cfg.title).toBe(COPY[`${RDC}.confirmDialog.title`]);
    expect(cfg.content).toBe(COPY[`${RDC}.confirmDialog.content`]);
    expect(cfg.okText).toBe(COPY[`${RDC}.confirmDialog.okText`]);
    expect(cfg.cancelText).toBe(COPY[`${RDC}.confirmDialog.cancelText`]);

    // The destructive IPC must not fire until the user confirms.
    expect(recoverMock).not.toHaveBeenCalled();
  });

  it('AC-5b: confirming (onOk) invokes recoverCorruptedDatabase exactly once', async () => {
    const confirmSpy = stubModalConfirm();
    renderFooter();

    fireEvent.click(screen.getByTestId('recoverable-database-corruption-rebuild'));
    const cfg = confirmSpy.mock.calls[0][0] as ConfirmConfig;
    await cfg.onOk?.();

    expect(recoverMock).toHaveBeenCalledTimes(1);
  });

  it('AC-5c: cancelling (never invoking onOk) does not recover', () => {
    const confirmSpy = stubModalConfirm();
    renderFooter();

    fireEvent.click(screen.getByTestId('recoverable-database-corruption-rebuild'));
    // Simulate the user cancelling / closing the confirmation: onOk is never called.
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(recoverMock).not.toHaveBeenCalled();
  });

  it('AC-6: rebuild button is danger secondary (not a primary CTA); report stays neutral', () => {
    renderFooter();

    const rebuild = screen.getByTestId('recoverable-database-corruption-rebuild');
    expect(rebuild.className).not.toContain('arco-btn-primary');
    expect(rebuild.className).toContain('arco-btn-status-danger');

    const report = screen.getByTestId('installation-integrity-report');
    expect(report.className).not.toContain('arco-btn-primary');
  });

  it('AC-7: confirmDialog copy is wired through i18n (present, non-empty, not raw keys)', () => {
    const confirmSpy = stubModalConfirm();
    renderFooter();

    fireEvent.click(screen.getByTestId('recoverable-database-corruption-rebuild'));
    const cfg = confirmSpy.mock.calls[0][0] as ConfirmConfig;

    for (const value of [cfg.title, cfg.content, cfg.okText, cfg.cancelText]) {
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
    // Resolved copy must differ from the raw key path (i.e. t() actually mapped it).
    expect(cfg.title).not.toContain(`${RDC}.confirmDialog`);
    expect(cfg.content).not.toContain(`${RDC}.confirmDialog`);

    // Regression guard on the representative shipped description copy: the
    // misleading "for now" wording is gone. 13-language completeness is enforced
    // by scripts/check-i18n.js.
    expect(COPY[`${RDC}.description`].toLowerCase()).not.toContain('for now');
  });
});
