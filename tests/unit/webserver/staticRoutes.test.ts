import { describe, expect, it } from 'vitest';
import {
  REMOTE_VITE_CLIENT_STUB,
  shouldDisableViteClient,
  shouldServeRemoteViteClientStub,
  stripViteClientScript,
} from '../../../src/process/webserver/routes/staticRoutes';

describe('stripViteClientScript', () => {
  it('removes the vite client module script from proxied html', () => {
    const html = `<!doctype html>
<html>
  <head>
    <script type="module" src="/@vite/client"></script>
    <meta charset="UTF-8" />
  </head>
</html>`;

    expect(stripViteClientScript(html)).not.toContain('/@vite/client');
  });

  it('leaves unrelated html untouched', () => {
    const html = '<html><head><script type="module" src="./main.tsx"></script></head></html>';

    expect(stripViteClientScript(html)).toBe(html);
  });
});

describe('shouldDisableViteClient', () => {
  it('keeps vite client enabled for localhost access', () => {
    expect(shouldDisableViteClient({ hostname: 'localhost' })).toBe(false);
    expect(shouldDisableViteClient({ hostname: '127.0.0.1' })).toBe(false);
    expect(shouldDisableViteClient({ hostname: '::1' })).toBe(false);
  });

  it('disables vite client for remote hosts', () => {
    expect(shouldDisableViteClient({ hostname: '192.168.184.130' })).toBe(true);
    expect(shouldDisableViteClient({ hostname: 'aionui.local' })).toBe(true);
  });
});

describe('shouldServeRemoteViteClientStub', () => {
  it('serves a no-hmr vite client stub only for remote hosts', () => {
    expect(shouldServeRemoteViteClientStub({ hostname: '192.168.184.130', url: '/@vite/client' })).toBe(true);
    expect(shouldServeRemoteViteClientStub({ hostname: 'localhost', url: '/@vite/client' })).toBe(false);
    expect(shouldServeRemoteViteClientStub({ hostname: '192.168.184.130', url: '/main.tsx' })).toBe(false);
  });

  it('uses a websocket-free vite client stub', () => {
    expect(REMOTE_VITE_CLIENT_STUB).toContain('createHotContext');
    expect(REMOTE_VITE_CLIENT_STUB).toContain('updateStyle');
    expect(REMOTE_VITE_CLIENT_STUB).not.toContain('new WebSocket');
  });
});
