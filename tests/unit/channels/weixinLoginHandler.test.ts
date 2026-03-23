import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock WeixinLogin before importing WeixinLoginHandler
let mockStartLoginFn = vi.fn();
vi.mock('@process/channels/plugins/weixin/WeixinLogin', () => ({
  startLogin: (...args: unknown[]) => mockStartLoginFn(...args),
}));

async function loadHandlerClass() {
  vi.resetModules();
  vi.doMock('@process/channels/plugins/weixin/WeixinLogin', () => ({
    startLogin: (...args: unknown[]) => mockStartLoginFn(...args),
  }));
  const mod = await import('@process/channels/plugins/weixin/WeixinLoginHandler');
  return mod.WeixinLoginHandler;
}

function makeMockWindow() {
  return {
    webContents: { send: vi.fn() },
  };
}

describe('WeixinLoginHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls startLogin and resolves when onDone fires', async () => {
    const WeixinLoginHandler = await loadHandlerClass();
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

  it('sends weixin:login:qr event to renderer on onQR', async () => {
    const WeixinLoginHandler = await loadHandlerClass();
    const win = makeMockWindow();
    const handler = new WeixinLoginHandler(() => win as never);

    mockStartLoginFn = vi.fn(({ onQR, onDone }: { onQR: (url: string) => void; onDone: (r: unknown) => void }) => {
      setTimeout(() => {
        onQR('https://qr.example.com/abc');
        onDone({ accountId: 'u1', botToken: 'tok', baseUrl: 'https://x' });
      }, 0);
      return { abort: vi.fn() };
    });

    await handler.startLogin();
    expect(win.webContents.send).toHaveBeenCalledWith('weixin:login:qr', {
      qrcodeUrl: 'https://qr.example.com/abc',
    });
  });

  it('abort() cancels in-progress login', async () => {
    const WeixinLoginHandler = await loadHandlerClass();
    const win = makeMockWindow();
    const handler = new WeixinLoginHandler(() => win as never);

    const mockAbort = vi.fn();
    mockStartLoginFn = vi.fn(() => ({ abort: mockAbort }));

    handler.startLogin().catch(() => {}); // do not await
    handler.abort();

    expect(mockAbort).toHaveBeenCalledTimes(1);
  });

  it('cancels previous login when startLogin is called twice', async () => {
    const WeixinLoginHandler = await loadHandlerClass();
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
    // first abort was called when second startLogin was initiated
    expect(firstAbort).toHaveBeenCalled();
  });
});
