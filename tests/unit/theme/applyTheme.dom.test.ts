import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme } from '@/renderer/utils/theme/applyTheme';
import type { Theme } from '@/common/theme/types';

const base = { builtin: true, created_at: 0, updated_at: 0 };

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.body.removeAttribute('arco-theme');
  document.getElementById('theme-tokens')?.remove();
  document.getElementById('theme-decoration')?.remove();
});

describe('applyTheme', () => {
  it('sets appearance attributes', () => {
    applyTheme({ ...base, id: 'dark', name: 'Dark', appearance: 'dark' } as Theme);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.body.getAttribute('arco-theme')).toBe('dark');
  });
  it('defers arco-theme (does not silently skip) when body is not ready, then converges on DOMContentLoaded', () => {
    // jsdom always has a body, so simulate early boot (readyState === 'loading')
    // where documentElement exists but body is null. The old `root.body?.setAttribute`
    // would silently skip arco-theme here, leaving data-theme dark and Arco light.
    const realBody = document.body;
    let bodyReady = false;
    Object.defineProperty(document, 'body', {
      configurable: true,
      get: () => (bodyReady ? realBody : null),
    });
    try {
      realBody.removeAttribute('arco-theme');
      document.documentElement.removeAttribute('data-theme');

      applyTheme({ ...base, id: 'dark', name: 'Dark', appearance: 'dark' } as Theme, document);

      // data-theme lands immediately (documentElement always exists)...
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      // ...but arco-theme must be deferred, NOT lost. If the fix regressed to the
      // old silent-skip, no listener is registered and this attribute stays null
      // forever — the assertions below then fail (this is a real no-op guard).
      expect(realBody.getAttribute('arco-theme')).toBeNull();

      bodyReady = true;
      document.dispatchEvent(new Event('DOMContentLoaded'));

      // Both attributes now converge — no silent dark/light split.
      expect(realBody.getAttribute('arco-theme')).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    } finally {
      // Restore jsdom's native body getter for the remaining tests.
      Reflect.deleteProperty(document, 'body');
    }
  });
  it('injects decoration css when present and removes when absent', () => {
    applyTheme({ ...base, id: 'hk', name: 'HK', appearance: 'light', css: 'body{color:red}' } as Theme);
    expect(document.getElementById('theme-decoration')?.textContent).toContain('color:red');
    applyTheme({ ...base, id: 'light', name: 'Light', appearance: 'light' } as Theme);
    expect(document.getElementById('theme-decoration')).toBeNull();
  });
  it('writes tokens to a :root style block when present', () => {
    applyTheme({ ...base, id: 't', name: 'T', appearance: 'light', tokens: { '--primary': '#abc' } } as Theme);
    expect(document.getElementById('theme-tokens')?.textContent).toContain('--primary: #abc');
  });
});
