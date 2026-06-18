import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSystemPrefersDark, watchSystemPrefersDark } from '@renderer/utils/theme/systemAppearance';

type ChangeHandler = (e: { matches: boolean }) => void;

function installMatchMedia(matches: boolean) {
  const handlers = new Set<ChangeHandler>();
  const mql = {
    matches,
    addEventListener: vi.fn((_: string, h: ChangeHandler) => handlers.add(h)),
    removeEventListener: vi.fn((_: string, h: ChangeHandler) => handlers.delete(h)),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return {
    mql,
    fire(next: boolean) {
      mql.matches = next;
      handlers.forEach((h) => h({ matches: next }));
    },
  };
}

describe('systemAppearance', () => {
  beforeEach(() => {
    // jsdom has no matchMedia; each test installs its own stub
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('getSystemPrefersDark reflects the media query', () => {
    installMatchMedia(true);
    expect(getSystemPrefersDark()).toBe(true);
    installMatchMedia(false);
    expect(getSystemPrefersDark()).toBe(false);
  });

  it('getSystemPrefersDark returns false when matchMedia is unavailable', () => {
    expect(getSystemPrefersDark()).toBe(false);
  });

  it('watchSystemPrefersDark notifies on change and stops after unsubscribe', () => {
    const media = installMatchMedia(false);
    const onChange = vi.fn();
    const off = watchSystemPrefersDark(onChange);
    media.fire(true);
    expect(onChange).toHaveBeenCalledWith(true);
    off();
    media.fire(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(media.mql.removeEventListener).toHaveBeenCalled();
  });

  it('watchSystemPrefersDark is a no-op without matchMedia', () => {
    const off = watchSystemPrefersDark(vi.fn());
    expect(() => off()).not.toThrow();
  });
});
