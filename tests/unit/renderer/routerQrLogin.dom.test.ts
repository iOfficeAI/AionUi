import { describe, expect, it } from 'vitest';
import { normalizeQRLoginHashRoute } from '@renderer/components/layout/Router';

describe('normalizeQRLoginHashRoute', () => {
  it('rewrites path-based QR login URLs into the hash route used by the renderer', () => {
    window.history.replaceState(null, '', '/qr-login?token=abc123');

    normalizeQRLoginHashRoute();

    expect(window.location.href).toBe(`${window.location.origin}/#/qr-login?token=abc123`);
  });

  it('leaves existing hash QR login URLs unchanged', () => {
    window.history.replaceState(null, '', '/#/qr-login?token=abc123');

    normalizeQRLoginHashRoute();

    expect(window.location.href).toBe(`${window.location.origin}/#/qr-login?token=abc123`);
  });
});
