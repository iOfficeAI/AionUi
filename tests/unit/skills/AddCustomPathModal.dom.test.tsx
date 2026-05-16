import React from 'react';
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for AddCustomPathModal component (SK2 in N4a).
 * Shallow verification: module import + basic structure.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import AddCustomPathModal from '@/renderer/pages/settings/AssistantSettings/AddCustomPathModal';

describe('AddCustomPathModal', () => {
  it('exports a component (smoke)', () => {
    expect(AddCustomPathModal).toBeDefined();
    expect(typeof AddCustomPathModal).toBe('function');
  });

  it('has display name or name property (structure check)', () => {
    expect(AddCustomPathModal.displayName || AddCustomPathModal.name).toBeTruthy();
  });

  it('can be instantiated as JSX element (shallow)', () => {
    const element = <AddCustomPathModal visible={false} onCancel={() => {}} onConfirm={() => {}} />;
    expect(element.type).toBe(AddCustomPathModal);
  });
});
