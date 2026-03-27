import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPwa } from '@renderer/services/registerPwa';

const defaultElectronApi = (window as typeof window & { electronAPI?: unknown }).electronAPI;

afterEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: defaultElectronApi,
    writable: true,
  });
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('registerPwa', () => {
  it('registers the service worker in browser mode on localhost', async () => {
    const registration = { scope: './' } as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registration);

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });

    await expect(registerPwa()).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith('./sw.js', { scope: './' });
  });

  it('skips registration when running in Electron desktop mode', async () => {
    const register = vi.fn();

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {},
      writable: true,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });

    await expect(registerPwa()).resolves.toBeUndefined();
    expect(register).not.toHaveBeenCalled();
  });

  it('skips registration when serviceWorker is not in navigator', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    Reflect.deleteProperty(navigator, 'serviceWorker');

    await expect(registerPwa()).resolves.toBeUndefined();
  });

  it('skips registration on non-http protocol', async () => {
    const originalLocation = window.location;

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register: vi.fn() },
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'file:', hostname: 'localhost' },
      writable: true,
    });

    await expect(registerPwa()).resolves.toBeUndefined();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
  });

  it('skips registration on insecure non-localhost origin', async () => {
    const originalLocation = window.location;
    const originalIsSecureContext = window.isSecureContext;

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register: vi.fn() },
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'http:', hostname: '192.168.1.1' },
      writable: true,
    });
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
      writable: true,
    });

    await expect(registerPwa()).resolves.toBeUndefined();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: originalIsSecureContext,
      writable: true,
    });
  });

  it('returns undefined when service worker registration throws', async () => {
    const register = vi.fn().mockRejectedValue(new Error('Security error'));

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });

    await expect(registerPwa()).resolves.toBeUndefined();
    expect(register).toHaveBeenCalled();
  });
});
