/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  composeRuntimeSelectorLabel,
  getCurrentThoughtLevelLabel,
} from '@/renderer/components/agent/runtimeSelectorOptions';
import { describe, expect, it } from 'vitest';

const thoughtLevel = (currentValue: string | null) => ({
  id: 'reasoning_effort',
  category: 'thought_level',
  currentValue,
  options: [
    { value: 'low', label: 'Low' },
    { value: 'high', label: 'High' },
  ],
});

describe('getCurrentThoughtLevelLabel', () => {
  it('maps a known current to its option label', () => {
    expect(getCurrentThoughtLevelLabel(thoughtLevel('high'))).toBe('High');
  });

  it('falls back to the raw current when it has no option entry', () => {
    expect(getCurrentThoughtLevelLabel(thoughtLevel('ultra'))).toBe('ultra');
  });

  it('returns the localized Default when the axis exists but no current is known', () => {
    // Honest neutral — never options[0]: the backend resolves the real default.
    expect(getCurrentThoughtLevelLabel(thoughtLevel(null), 'Default')).toBe('Default');
  });

  it('returns empty without a default label so the pill shows model-only', () => {
    expect(getCurrentThoughtLevelLabel(thoughtLevel(null))).toBe('');
  });

  it('returns empty when there is no thought axis at all', () => {
    expect(getCurrentThoughtLevelLabel(null, 'Default')).toBe('');
    expect(getCurrentThoughtLevelLabel(undefined, 'Default')).toBe('');
  });
});

describe('composeRuntimeSelectorLabel', () => {
  it('joins model and known level with a middle dot', () => {
    expect(composeRuntimeSelectorLabel({ modelLabel: 'Fable', thoughtLevel: thoughtLevel('high') })).toBe(
      'Fable · High'
    );
  });

  it('shows model · Default when the level is unknown and a default label is given', () => {
    expect(
      composeRuntimeSelectorLabel({
        modelLabel: 'Fable',
        thoughtLevel: thoughtLevel(null),
        defaultThoughtLevelLabel: 'Default',
      })
    ).toBe('Fable · Default');
  });

  it('shows model only when there is no thought axis', () => {
    expect(composeRuntimeSelectorLabel({ modelLabel: 'Fable', thoughtLevel: null })).toBe('Fable');
  });
});
