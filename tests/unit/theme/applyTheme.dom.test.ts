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
  it('injects layered light/dark tokens under :root[data-theme] and removes them when absent', () => {
    applyTheme({
      ...base,
      id: 'layered',
      name: 'Layered',
      appearance: 'light',
      tokens: { light: { '--primary': '#0a7ea4' }, dark: { '--primary': '#38bdf8' } },
    } as Theme);
    const css = document.getElementById('theme-tokens')?.textContent ?? '';
    expect(css).toContain(":root[data-theme='light']");
    expect(css).toContain('--primary: #0a7ea4');
    expect(css).toContain(":root[data-theme='dark']");
    expect(css).toContain('--primary: #38bdf8');

    // Switching to a theme without tokens must clear the block.
    applyTheme({ ...base, id: 'light', name: 'Light', appearance: 'light' } as Theme);
    expect(document.getElementById('theme-tokens')).toBeNull();
  });
  it('updates meta theme-color to match theme bg-2 token or appearance default', () => {
    // Defaults must mirror the --bg-2 tokens in default-color-scheme.css
    // (#f2f3f5 light / #262626 dark) so PWA caption buttons blend with the titlebar.
    applyTheme({ ...base, id: 'light', name: 'Light', appearance: 'light' } as Theme);
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta?.content).toBe('#f2f3f5');

    applyTheme({ ...base, id: 'dark', name: 'Dark', appearance: 'dark' } as Theme);
    meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta?.content).toBe('#262626');

    applyTheme({ ...base, id: 'custom', name: 'Custom', appearance: 'light', tokens: { 'bg-2': '#eef0f4' } } as Theme);
    meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta?.content).toBe('#eef0f4');
  });

  it('prefers the computed --bg-2 token over the theme-derived fallback when a stylesheet defines it', () => {
    const style = document.createElement('style');
    style.textContent = ':root { --bg-2: #123456; }';
    document.head.appendChild(style);
    try {
      applyTheme({ ...base, id: 'dark', name: 'Dark', appearance: 'dark' } as Theme);
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      // jsdom computes custom properties from :root styles, so the live token wins.
      expect(meta?.content).toBe('#123456');
    } finally {
      style.remove();
    }
  });
});
