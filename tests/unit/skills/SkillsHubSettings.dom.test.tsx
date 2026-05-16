import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for SkillsHubSettings component (SK3 in N4a).
 * Shallow verification: module import + basic structure.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import SkillsHubSettings from '@/renderer/pages/settings/SkillsHubSettings';

describe('SkillsHubSettings', () => {
  it('exports a component (smoke)', () => {
    expect(SkillsHubSettings).toBeDefined();
    expect(typeof SkillsHubSettings).toBe('function');
  });

  it('has display name or name property (structure check)', () => {
    expect(SkillsHubSettings.displayName || SkillsHubSettings.name).toBeTruthy();
  });

  it('can be instantiated as JSX element (shallow)', () => {
    const element = <SkillsHubSettings />;
    expect(element.type).toBe(SkillsHubSettings);
  });
});
