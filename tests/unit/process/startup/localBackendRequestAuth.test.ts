import { describe, expect, it } from 'vitest';
import {
  isTrustedLocalBackendRequester,
  shouldAttachLocalBackendSecret,
} from '@/process/startup/localBackendRequestAuth';

describe('shouldAttachLocalBackendSecret', () => {
  it('allows only the trusted main renderer on the exact loopback backend', () => {
    expect(
      shouldAttachLocalBackendSecret({ url: 'http://127.0.0.1:43123/api/fs/stream', webContentsId: 7 }, 7, 43123)
    ).toBe(true);
    expect(shouldAttachLocalBackendSecret({ url: 'ws://127.0.0.1:43123/ws', webContentsId: 7 }, 7, 43123)).toBe(true);
  });

  it('rejects preview WebViews, missing initiators, other ports, and malformed URLs', () => {
    expect(
      shouldAttachLocalBackendSecret({ url: 'http://127.0.0.1:43123/api/settings', webContentsId: 8 }, 7, 43123)
    ).toBe(false);
    expect(shouldAttachLocalBackendSecret({ url: 'http://127.0.0.1:43123/api/settings' }, 7, 43123)).toBe(false);
    expect(
      shouldAttachLocalBackendSecret({ url: 'http://127.0.0.1:43124/api/settings', webContentsId: 7 }, 7, 43123)
    ).toBe(false);
    expect(shouldAttachLocalBackendSecret({ url: 'not a url', webContentsId: 7 }, 7, 43123)).toBe(false);
  });

  it('exposes the preload capability only to the trusted main renderer', () => {
    expect(isTrustedLocalBackendRequester(7, 7)).toBe(true);
    expect(isTrustedLocalBackendRequester(8, 7)).toBe(false);
    expect(isTrustedLocalBackendRequester(undefined, 7)).toBe(false);
    expect(isTrustedLocalBackendRequester(7, undefined)).toBe(false);
  });
});
