import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAllWindows = vi.fn<() => Array<{ webContents: { setZoomFactor: (factor: number) => void } }>>();

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows,
  },
}));

describe('zoom', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getAllWindows.mockReturnValue([]);
  });

  it('should restore the persisted zoom factor during startup', async () => {
    const { getZoomFactor, initializeZoomFactor } = await import('@process/utils/zoom');

    initializeZoomFactor(1.2);

    expect(getZoomFactor()).toBe(1.2);
  });

  it('should fall back to the default zoom factor for invalid persisted values', async () => {
    const { getZoomFactor, initializeZoomFactor } = await import('@process/utils/zoom');

    initializeZoomFactor(Number.NaN);

    expect(getZoomFactor()).toBe(1);
  });

  it('should clamp and broadcast new zoom values to every open window', async () => {
    const setZoomFactorA = vi.fn();
    const setZoomFactorB = vi.fn();
    getAllWindows.mockReturnValue([
      { webContents: { setZoomFactor: setZoomFactorA } },
      { webContents: { setZoomFactor: setZoomFactorB } },
    ]);

    const { getZoomFactor, setZoomFactor } = await import('@process/utils/zoom');

    const updated = setZoomFactor(2);

    expect(updated).toBe(1.3);
    expect(getZoomFactor()).toBe(1.3);
    expect(setZoomFactorA).toHaveBeenCalledWith(1.3);
    expect(setZoomFactorB).toHaveBeenCalledWith(1.3);
  });
});
