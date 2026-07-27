/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: mocks.openExternalUrl,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// AionModal reads ThemeContext for font scaling; provide a minimal theme so it mounts.
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', fontScale: 1 }),
}));

import UpdateMigrationDialog, {
  OPEN_MIGRATION_DIALOG_EVENT,
} from '@/renderer/components/settings/UpdateMigrationDialog';

const openDialog = () => {
  fireEvent(window, new CustomEvent(OPEN_MIGRATION_DIALOG_EVENT));
};

const INVITE_SHOWN_KEY = 'aionui.migration-invite-shown';

describe('UpdateMigrationDialog', () => {
  beforeEach(() => {
    // Default: invite already auto-shown, so existing event-driven tests are
    // not polluted by the first-launch auto-open.
    window.localStorage.setItem(INVITE_SHOWN_KEY, '1');
  });

  afterEach(() => {
    cleanup();
    mocks.openExternalUrl.mockClear();
    window.localStorage.removeItem(INVITE_SHOWN_KEY);
  });

  it('is hidden until the open event fires', () => {
    render(<UpdateMigrationDialog />);
    expect(screen.queryByText('update.migration.letter.title')).toBeNull();
  });

  it('auto-opens on first launch and records the shown flag', async () => {
    window.localStorage.removeItem(INVITE_SHOWN_KEY);
    render(<UpdateMigrationDialog />);
    await waitFor(() => expect(screen.getByText('update.migration.letter.title')).toBeTruthy());
    expect(window.localStorage.getItem(INVITE_SHOWN_KEY)).toBe('1');
  });

  it('does not auto-open when the shown flag is already set', () => {
    render(<UpdateMigrationDialog />);
    expect(screen.queryByText('update.migration.letter.title')).toBeNull();
  });

  it('shows the migration card when the open event fires', async () => {
    render(<UpdateMigrationDialog />);
    openDialog();
    await waitFor(() => expect(screen.getByText('update.migration.letter.title')).toBeTruthy());
    expect(screen.getByText('update.migration.letter.introBold')).toBeTruthy();
  });

  it('opens the official website when the primary button is clicked', async () => {
    render(<UpdateMigrationDialog />);
    openDialog();
    await waitFor(() => expect(screen.getByText('update.migration.letter.downloadNew')).toBeTruthy());
    fireEvent.click(screen.getByText('update.migration.letter.downloadNew'));
    expect(mocks.openExternalUrl).toHaveBeenCalledWith('https://www.aionui.com/');
  });
});
