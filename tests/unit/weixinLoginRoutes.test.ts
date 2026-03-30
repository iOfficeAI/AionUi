import { EventEmitter } from 'events';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStartLogin, mockAbort } = vi.hoisted(() => ({
  mockStartLogin: vi.fn(),
  mockAbort: vi.fn(),
}));

vi.mock('@process/channels/plugins/weixin/WeixinLogin', () => ({
  startLogin: mockStartLogin,
}));

function getWeixinLoginHandler(app: express.Express) {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; stack?: Array<{ handle: express.RequestHandler }> } }) =>
      entry.route?.path === '/api/channel/weixin/login'
  );
  return layer?.route?.stack?.[1]?.handle as express.RequestHandler;
}

describe('registerWeixinLoginRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartLogin.mockReturnValue({ abort: mockAbort });
  });

  it('streams qr, scanned, done, and aborts on client close', async () => {
    const { registerWeixinLoginRoutes } = await import('@process/webserver/routes/weixinLoginRoutes');
    const app = express();
    registerWeixinLoginRoutes(app, (_req, _res, next) => next());

    const handler = getWeixinLoginHandler(app);
    const req = new EventEmitter() as express.Request;
    const writes: string[] = [];
    const res = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((chunk: string) => {
        writes.push(chunk);
      }),
      end: vi.fn(),
    } as unknown as express.Response;

    handler(req, res, vi.fn());

    const callbacks = mockStartLogin.mock.calls[0]?.[0] as {
      onQR: (pageUrl: string, qrcodeData: string) => void;
      onScanned: () => void;
      onDone: (result: { accountId: string; botToken: string; baseUrl: string }) => void;
    };

    callbacks.onQR('https://qr.page/url', 'ticket_raw');
    callbacks.onScanned();
    callbacks.onDone({ accountId: 'acc1', botToken: 'bot1', baseUrl: 'https://base.url' });
    req.emit('close');

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.flushHeaders).toHaveBeenCalled();
    expect(writes).toContain('event: qr\ndata: {"qrcodeData":"ticket_raw"}\n\n');
    expect(writes).toContain('event: scanned\ndata: {}\n\n');
    expect(writes).toContain(
      'event: done\ndata: {"accountId":"acc1","botToken":"bot1","baseUrl":"https://base.url"}\n\n'
    );
    expect(res.end).toHaveBeenCalled();
    expect(mockAbort).toHaveBeenCalled();
  });
});
