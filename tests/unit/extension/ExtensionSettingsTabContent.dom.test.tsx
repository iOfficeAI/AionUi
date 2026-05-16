import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for ExtensionSettingsTabContent (E2 in N4a).
 * Shallow verification: module import + basic structure, no deep routing.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import ExtensionSettingsTabContent from '@/renderer/components/settings/SettingsModal/contents/ExtensionSettingsTabContent';

describe('ExtensionSettingsTabContent', () => {
  it('exports a component (smoke)', () => {
    expect(ExtensionSettingsTabContent).toBeDefined();
    expect(typeof ExtensionSettingsTabContent).toBe('function');
  });

  it('has display name or name property (structure check)', () => {
    expect(ExtensionSettingsTabContent.displayName || ExtensionSettingsTabContent.name).toBeTruthy();
  });

  it('can be instantiated as JSX element (shallow)', () => {
    const element = <ExtensionSettingsTabContent />;
    expect(element.type).toBe(ExtensionSettingsTabContent);
  });
});
