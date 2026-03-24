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
});
