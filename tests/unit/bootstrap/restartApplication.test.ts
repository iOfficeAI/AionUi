/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { restartApplication } from '@/process/bridge/restartApplication';

describe('restartApplication', () => {
  it('requires a manual restart in development mode instead of relaunching', () => {
    const app = {
      isPackaged: false,
      relaunch: vi.fn(),
      exit: vi.fn(),
      quit: vi.fn(),
    };

    const result = restartApplication(app);

    expect(result).toEqual({
      restarted: false,
      manualRestartRequired: true,
      reason: 'dev-mode',
    });
    expect(app.relaunch).not.toHaveBeenCalled();
    expect(app.exit).not.toHaveBeenCalled();
  });

  it('relaunches packaged builds through normal quit cleanup', () => {
    const app = {
      isPackaged: true,
      relaunch: vi.fn(),
      exit: vi.fn(),
      quit: vi.fn(),
    };

    const result = restartApplication(app);

    expect(result).toEqual({
      restarted: true,
      manualRestartRequired: false,
    });
    expect(app.relaunch).toHaveBeenCalledTimes(1);
    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(app.exit).not.toHaveBeenCalled();
  });
});
