/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { shouldInitializeAutoUpdater, shouldRunAutomaticStartupUpdateCheck } from '@process/utils/autoUpdateStartup';

describe('autoUpdateStartup', () => {
  it('initializes the updater for manual checks by default', () => {
    expect(shouldInitializeAutoUpdater({})).toBe(true);
  });

  it('does not run an automatic startup update check unless explicitly enabled', () => {
    expect(shouldRunAutomaticStartupUpdateCheck({})).toBe(false);
  });

  it('allows automatic startup checks only through an explicit opt-in flag', () => {
    expect(shouldRunAutomaticStartupUpdateCheck({ AIONUI_AUTO_UPDATE_ON_STARTUP: '1' })).toBe(true);
  });

  it('keeps the updater disabled in CI, E2E, or explicit disable modes', () => {
    expect(
      shouldInitializeAutoUpdater({
        AIONUI_AUTO_UPDATE_ON_STARTUP: '1',
        AIONUI_DISABLE_AUTO_UPDATE: '1',
      })
    ).toBe(false);
    expect(
      shouldRunAutomaticStartupUpdateCheck({
        AIONUI_AUTO_UPDATE_ON_STARTUP: '1',
        AIONUI_E2E_TEST: '1',
      })
    ).toBe(false);
    expect(
      shouldRunAutomaticStartupUpdateCheck({
        AIONUI_AUTO_UPDATE_ON_STARTUP: '1',
        GITHUB_ACTIONS: 'true',
      })
    ).toBe(false);
  });
});
