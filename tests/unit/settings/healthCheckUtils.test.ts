/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getHealthCheckErrorMessage } from '@/renderer/components/settings/SettingsModal/contents/healthCheckUtils';

describe('getHealthCheckErrorMessage', () => {
  it('uses the backend error message field', () => {
    expect(getHealthCheckErrorMessage({ message: 'Aionrs agent error: upstream failed' })).toBe(
      'Aionrs agent error: upstream failed'
    );
  });

  it('does not read legacy error fields', () => {
    expect(getHealthCheckErrorMessage({ error: 'legacy error' })).toBe('Unknown error');
  });
});
