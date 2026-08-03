import { describe, expect, it, vi } from 'vitest';
import { containsOversizedBridgeString, sendToBridgeWindows, type BridgeWindowTarget } from '@/common/adapter/registry';

function target(send: (channel: string, payload: string) => void, destroyed = false): BridgeWindowTarget {
  return {
    isDestroyed: () => destroyed,
    webContents: {
      isDestroyed: () => destroyed,
      send,
    },
  };
}

describe('sendToBridgeWindows', () => {
  it('continues delivering when one window send throws', () => {
    const error = new Error('Object has been destroyed');
    const healthySend = vi.fn();
    const onError = vi.fn();
    const windows = [target(healthySend), target(() => void 0), target(() => void 0)];
    windows[1].webContents.send = () => {
      throw error;
    };

    sendToBridgeWindows(windows, 'bridge:event', '{"type":"finish"}', onError);

    expect(healthySend).toHaveBeenCalledWith('bridge:event', '{"type":"finish"}');
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('prunes windows already destroyed before delivery', () => {
    const windows = [target(vi.fn(), true)];

    sendToBridgeWindows(windows, 'bridge:event', '{}', vi.fn());

    expect(windows).toEqual([]);
  });
});

describe('containsOversizedBridgeString', () => {
  it('finds nested oversized strings before IPC serialization', () => {
    expect(
      containsOversizedBridgeString(
        {
          update: {
            raw_output: {
              image_content: { data: 'A'.repeat(1025) },
            },
          },
        },
        1024
      )
    ).toBe(true);
    expect(containsOversizedBridgeString({ content: 'safe' }, 1024)).toBe(false);
  });

  it('handles circular event metadata without recursing forever', () => {
    const value: Record<string, unknown> = { content: 'safe' };
    value.self = value;

    expect(containsOversizedBridgeString(value, 1024)).toBe(false);
  });
});
