import { describe, expect, it, vi } from 'vitest';

// Mock electron (required for WeixinLoginHandler import, never actually called in these tests)
vi.mock('electron', () => ({ BrowserWindow: vi.fn() }));

// Mock WeixinLogin — delegates to a test-level variable so each test can reassign it
let mockStartLoginFn = vi.fn();
vi.mock('@process/channels/plugins/weixin/WeixinLogin', () => ({
  startLogin: (...args: unknown[]) => mockStartLoginFn(...args),
}));

import { WeixinLoginHandler } from '@process/channels/plugins/weixin/WeixinLoginHandler';

const FAKE_DATA_URL = 'data:image/png;base64,fakeqr==';

function makeMockWindow() {
  return { webContents: { send: vi.fn() } };
}

describe('WeixinLoginHandler', () => {
  it('calls startLogin and resolves when onDone fires', async () => {
    const win = makeMockWindow();
    const handler = new WeixinLoginHandler(() => win as never);

    mockStartLoginFn = vi.fn(({ onDone }: { onDone: (r: unknown) => void }) => {
      setTimeout(() => onDone({ accountId: 'u1', botToken: 'tok', baseUrl: 'https://x' }), 0);
      return { abort: vi.fn() };
    });

    const result = await handler.startLogin();
    expect(result.accountId).toBe('u1');
    expect(result.botToken).toBe('tok');
  });

  it('sends weixin:login:qr event with canvas data URL after renderQRPage', async () => {
    const win = makeMockWindow();
    const handler = new WeixinLoginHandler(() => win as never);

    // Spy on the private renderQRPage — avoids spinning up a real hidden BrowserWindow
    vi.spyOn(handler as never, 'renderQRPage').mockResolvedValue(FAKE_DATA_URL as never);

    let capturedOnQR: ((url: string) => void) | undefined;
    let capturedOnDone: ((r: unknown) => void) | undefined;

    mockStartLoginFn = vi.fn(({ onQR, onDone }: { onQR: (url: string) => void; onDone: (r: unknown) => void }) => {
      capturedOnQR = onQR;
      capturedOnDone = onDone;
      return { abort: vi.fn() };
    });

    const loginPromise = handler.startLogin();

    // Trigger onQR — handler calls renderQRPage(pageUrl) then sends the data URL to renderer
    capturedOnQR?.('https://qr.weixin.qq.com/page');

    // Flush the promise chain (renderQRPage is mocked to resolve immediately)
    await Promise.resolve();
    await Promise.resolve();

    expect(win.webContents.send).toHaveBeenCalledWith('weixin:login:qr', {
      qrcodeUrl: FAKE_DATA_URL,
    });

    capturedOnDone?.({ accountId: 'u1', botToken: 'tok', baseUrl: 'https://x' });
    await loginPromise;
  });

  it('abort() cancels in-progress login', async () => {
    const win = makeMockWindow();
    const handler = new WeixinLoginHandler(() => win as never);

    const mockAbort = vi.fn();
    mockStartLoginFn = vi.fn(() => ({ abort: mockAbort }));

    handler.startLogin().catch(() => {}); // do not await
    handler.abort();

    expect(mockAbort).toHaveBeenCalledTimes(1);
  });

  it('cancels previous login when startLogin is called twice', async () => {
    const win = makeMockWindow();
    const handler = new WeixinLoginHandler(() => win as never);

    const firstAbort = vi.fn();
    let callCount = 0;

    mockStartLoginFn = vi.fn(({ onDone }: { onDone: (r: unknown) => void }) => {
      callCount++;
      if (callCount === 2) {
        setTimeout(() => onDone({ accountId: 'u2', botToken: 'tok2', baseUrl: 'https://x' }), 0);
      }
      return { abort: firstAbort };
    });

    handler.startLogin().catch(() => {}); // first call — never resolves
    const second = handler.startLogin(); // second call cancels first
    await expect(second).resolves.toBeDefined();
    expect(firstAbort).toHaveBeenCalled();
  });
});
