/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

import UpdateMigrationDialog, { OPEN_MIGRATION_DIALOG_EVENT } from '@/renderer/components/settings/UpdateMigrationDialog';

const openDialog = () => {
  fireEvent(window, new CustomEvent(OPEN_MIGRATION_DIALOG_EVENT));
};

describe('UpdateMigrationDialog', () => {
  afterEach(() => {
    cleanup();
    mocks.openExternalUrl.mockClear();
  });

  it('is hidden until the open event fires', () => {
    render(<UpdateMigrationDialog />);
    expect(screen.queryByText('update.migration.title')).toBeNull();
  });

  it('shows the migration card when the open event fires', async () => {
    render(<UpdateMigrationDialog />);
    openDialog();
    await waitFor(() => expect(screen.getByText('update.migration.title')).toBeTruthy());
    expect(screen.getByText('update.migration.description')).toBeTruthy();
  });

  it('opens the official website when the primary button is clicked', async () => {
    render(<UpdateMigrationDialog />);
    openDialog();
    await waitFor(() => expect(screen.getByText('update.migration.gotoWebsite')).toBeTruthy());
    fireEvent.click(screen.getByText('update.migration.gotoWebsite'));
    expect(mocks.openExternalUrl).toHaveBeenCalledWith('https://www.aionui.com/');
  });

  it('does not open the website when the later button is clicked', async () => {
    render(<UpdateMigrationDialog />);
    openDialog();
    await waitFor(() => expect(screen.getByText('update.migration.later')).toBeTruthy());
    fireEvent.click(screen.getByText('update.migration.later'));
    expect(mocks.openExternalUrl).not.toHaveBeenCalled();
  });
});
