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

  it('maps Ctrl/Cmd + equal variants to zoom in', async () => {
    const { getZoomShortcutAction } = await import('@process/utils/zoom');

    expect(
      getZoomShortcutAction(
        {
          type: 'keyDown',
          key: '=',
          code: 'Equal',
          isComposing: false,
          control: true,
          meta: false,
          alt: false,
        },
        'linux'
      )
    ).toBe('zoomIn');

    expect(
      getZoomShortcutAction(
        {
          type: 'keyDown',
          key: '+',
          code: 'Equal',
          isComposing: false,
          control: false,
          meta: true,
          alt: false,
        },
        'darwin'
      )
    ).toBe('zoomIn');
  });

  it('maps minus and numpad subtract to zoom out', async () => {
    const { getZoomShortcutAction } = await import('@process/utils/zoom');

    expect(
      getZoomShortcutAction(
        {
          type: 'keyDown',
          key: '-',
          code: 'Minus',
          isComposing: false,
          control: true,
          meta: false,
          alt: false,
        },
        'linux'
      )
    ).toBe('zoomOut');

    expect(
      getZoomShortcutAction(
        {
          type: 'keyDown',
          key: 'Subtract',
          code: 'NumpadSubtract',
          isComposing: false,
          control: true,
          meta: false,
          alt: false,
        },
        'linux'
      )
    ).toBe('zoomOut');
  });

  it('maps zero variants to reset zoom and ignores Alt-modified input', async () => {
    const { getZoomShortcutAction } = await import('@process/utils/zoom');

    expect(
      getZoomShortcutAction(
        {
          type: 'keyDown',
          key: '0',
          code: 'Digit0',
          isComposing: false,
          control: true,
          meta: false,
          alt: false,
        },
        'linux'
      )
    ).toBe('resetZoom');

    expect(
      getZoomShortcutAction(
        {
          type: 'keyDown',
          key: '=',
          code: 'Equal',
          isComposing: false,
          control: true,
          meta: false,
          alt: true,
        },
        'linux'
      )
    ).toBeNull();
  });

  it('does not match non-US top-row physical keys by code alone', async () => {
    const { getZoomShortcutAction } = await import('@process/utils/zoom');

    expect(
      getZoomShortcutAction(
        {
          type: 'keyDown',
          key: 'à',
          code: 'Digit0',
          isComposing: false,
          control: true,
          meta: false,
          alt: false,
        },
        'linux'
      )
    ).toBeNull();
  });

  it('still supports numpad zoom shortcuts through code fallback', async () => {
    const { getZoomShortcutAction } = await import('@process/utils/zoom');

    expect(
      getZoomShortcutAction(
        {
          type: 'keyDown',
          key: 'Unidentified',
          code: 'NumpadAdd',
          isComposing: false,
          control: true,
          meta: false,
          alt: false,
        },
        'linux'
      )
    ).toBe('zoomIn');
  });

  it('does not treat Ctrl+Insert on numpad 0 as reset zoom', async () => {
    const { getZoomShortcutAction } = await import('@process/utils/zoom');

    expect(
      getZoomShortcutAction(
        {
          type: 'keyDown',
          key: 'Insert',
          code: 'Numpad0',
          isComposing: false,
          control: true,
          meta: false,
          alt: false,
        },
        'linux'
      )
    ).toBeNull();
  });
});
