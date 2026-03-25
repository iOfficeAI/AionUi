import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock https before importing WeixinLogin
vi.mock('https', () => ({
  default: {
    request: vi.fn(),
  },
}));

import https from 'https';
import { startLogin } from '@process/channels/plugins/weixin/WeixinLogin';

type MockRequestCallback = (res: {
  on: (event: string, cb: (data?: unknown) => void) => void;
  statusCode?: number;
}) => void;

function mockHttpsGet(responses: Array<Record<string, unknown>>) {
  let callIndex = 0;
  vi.mocked(https.request).mockImplementation((_options, callback) => {
    const responseData = responses[callIndex++] ?? {};
    const mockReq = {
      write: vi.fn(),
      end: vi.fn(() => {
        // Simulate async response
        setTimeout(() => {
          const cb = callback as MockRequestCallback;
          const mockRes = {
            on: (event: string, handler: (data?: unknown) => void) => {
              if (event === 'data') handler(JSON.stringify(responseData));
              if (event === 'end') handler();
            },
          };
          cb(mockRes);
        }, 0);
      }),
      on: vi.fn(),
      setTimeout: vi.fn(),
    };
    return mockReq as unknown as ReturnType<typeof https.request>;
  });
}

describe('startLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onQR with qrcode_img_content from first API response', async () => {
    mockHttpsGet([
      { qrcode: 'ticket_1', qrcode_img_content: 'https://qr.weixin.qq.com/abc' },
      { status: 'confirmed', bot_token: 'tok_test', baseurl: 'https://base.url', ilink_bot_id: 'user_123' },
    ]);

    const onQR = vi.fn();
    const onScanned = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const handle = startLogin({ onQR, onScanned, onDone, onError });
    await new Promise((r) => setTimeout(r, 50));

    expect(onQR).toHaveBeenCalledWith('https://qr.weixin.qq.com/abc');
    expect(onDone).toHaveBeenCalledWith({
      accountId: 'user_123',
      botToken: 'tok_test',
      baseUrl: 'https://base.url',
    });
    handle.abort();
  });

  it('calls onScanned when status is scaned', async () => {
    mockHttpsGet([
      { qrcode: 't1', qrcode_img_content: 'https://qr.example.com/x' },
      { status: 'scaned' },
      { status: 'confirmed', bot_token: 'tok', baseurl: 'https://b.url', ilink_bot_id: 'u1' },
    ]);

    const onScanned = vi.fn();
    const onDone = vi.fn();
    const handle = startLogin({ onQR: vi.fn(), onScanned, onDone, onError: vi.fn() });
    await new Promise((r) => setTimeout(r, 100));

    expect(onScanned).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    handle.abort();
  });

  it('re-fetches QR code when status is expired', async () => {
    const onQR = vi.fn();
    mockHttpsGet([
      { qrcode: 't1', qrcode_img_content: 'https://qr1.example.com' },
      { status: 'expired' },
      { qrcode: 't2', qrcode_img_content: 'https://qr2.example.com' },
      { status: 'confirmed', bot_token: 'tok', baseurl: 'https://b.url', ilink_bot_id: 'u1' },
    ]);

    const onDone = vi.fn();
    const handle = startLogin({ onQR, onScanned: vi.fn(), onDone, onError: vi.fn() });
    await new Promise((r) => setTimeout(r, 100));

    expect(onQR).toHaveBeenCalledTimes(2);
    expect(onQR).toHaveBeenNthCalledWith(2, 'https://qr2.example.com');
    expect(onDone).toHaveBeenCalledTimes(1);
    handle.abort();
  });

  it('calls onError after 3 expired responses', async () => {
    mockHttpsGet([
      { qrcode: 't1', qrcode_img_content: 'https://qr1' },
      { status: 'expired' },
      { qrcode: 't2', qrcode_img_content: 'https://qr2' },
      { status: 'expired' },
      { qrcode: 't3', qrcode_img_content: 'https://qr3' },
      { status: 'expired' },
    ]);

    const onError = vi.fn();
    const handle = startLogin({ onQR: vi.fn(), onScanned: vi.fn(), onDone: vi.fn(), onError });
    await new Promise((r) => setTimeout(r, 200));

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    handle.abort();
  });

  it('abort() stops the flow without calling onError', async () => {
    // never-resolving poll
    vi.mocked(https.request).mockImplementation((_options, _callback) => {
      return {
        write: vi.fn(),
        end: vi.fn(),
        on: vi.fn(),
        setTimeout: vi.fn(),
      } as unknown as ReturnType<typeof https.request>;
    });

    const onError = vi.fn();
    const handle = startLogin({ onQR: vi.fn(), onScanned: vi.fn(), onDone: vi.fn(), onError });
    handle.abort();
    await new Promise((r) => setTimeout(r, 50));

    expect(onError).not.toHaveBeenCalled();
  });
});
