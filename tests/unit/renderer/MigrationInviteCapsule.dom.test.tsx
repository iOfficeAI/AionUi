/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import MigrationInviteCapsule from '@/renderer/components/layout/Titlebar/MigrationInviteCapsule';
import { OPEN_MIGRATION_DIALOG_EVENT } from '@/renderer/components/settings/UpdateMigrationDialog';

describe('MigrationInviteCapsule', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the capsule label', () => {
    render(<MigrationInviteCapsule />);
    expect(screen.getByText('update.migration.capsule')).toBeTruthy();
  });

  it('dispatches the open-migration-dialog event on click', () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_MIGRATION_DIALOG_EVENT, listener);

    render(<MigrationInviteCapsule />);
    fireEvent.click(screen.getByText('update.migration.capsule'));

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_MIGRATION_DIALOG_EVENT, listener);
  });
});
