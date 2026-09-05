import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ mac: false }));

vi.mock('@/renderer/utils/platform', () => ({
  isMacOS: () => platform.mac,
}));

import { useSettingsShortcut } from '@/renderer/hooks/ui/useSettingsShortcut';

const pressComma = (init: KeyboardEventInit = {}): void => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ...init }));
  });
};

describe('useSettingsShortcut', () => {
  beforeEach(() => {
    platform.mac = false;
  });

  it('toggles when Ctrl+, is pressed on Windows/Linux', () => {
    const onToggle = vi.fn();
    renderHook(() => useSettingsShortcut(onToggle));

    pressComma({ ctrlKey: true });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('toggles when ⌘, is pressed on macOS', () => {
    platform.mac = true;
    const onToggle = vi.fn();
    renderHook(() => useSettingsShortcut(onToggle));

    pressComma({ metaKey: true });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('ignores a plain comma press without the primary modifier', () => {
    const onToggle = vi.fn();
    renderHook(() => useSettingsShortcut(onToggle));

    pressComma();

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('ignores the wrong modifier combination', () => {
    const onToggle = vi.fn();
    renderHook(() => useSettingsShortcut(onToggle));

    pressComma({ ctrlKey: true, shiftKey: true });

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does not swallow a comma typed inside an editable target', () => {
    const onToggle = vi.fn();
    renderHook(() => useSettingsShortcut(onToggle));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    try {
      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true }));
      });
    } finally {
      input.remove();
    }

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('uses the latest toggle callback', () => {
    const onToggle = vi.fn();
    const { rerender } = renderHook(({ cb }) => useSettingsShortcut(cb), {
      initialProps: { cb: onToggle },
    });

    const newToggle = vi.fn();
    rerender({ cb: newToggle });
    pressComma({ ctrlKey: true });

    expect(onToggle).not.toHaveBeenCalled();
    expect(newToggle).toHaveBeenCalledTimes(1);
  });

  it('removes the listener on unmount', () => {
    const onToggle = vi.fn();
    const { unmount } = renderHook(() => useSettingsShortcut(onToggle));
    unmount();

    pressComma({ ctrlKey: true });

    expect(onToggle).not.toHaveBeenCalled();
  });
});
