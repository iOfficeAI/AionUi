import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for ExtensionSettingsPage (E1 in N4a).
 * Shallow verification: module import + basic structure, no deep routing.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import ExtensionSettingsPage from '@/renderer/pages/settings/ExtensionSettingsPage';

describe('ExtensionSettingsPage', () => {
  it('exports a component (smoke)', () => {
    expect(ExtensionSettingsPage).toBeDefined();
    expect(typeof ExtensionSettingsPage).toBe('function');
  });

  it('has display name or name property (structure check)', () => {
    expect(ExtensionSettingsPage.displayName || ExtensionSettingsPage.name).toBeTruthy();
  });

  it('can be instantiated as JSX element (shallow)', () => {
    const element = <ExtensionSettingsPage />;
    expect(element.type).toBe(ExtensionSettingsPage);
  });
});
