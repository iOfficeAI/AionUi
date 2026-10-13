import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalChromeLauncher } from '@process/services/browser/ExternalChromeLauncher';

describe('ExternalChromeLauncher', () => {
  let launcher: ExternalChromeLauncher;
  let mockServer: http.Server | null = null;
  const testPort = 19222;

  beforeEach(() => {
    launcher = new ExternalChromeLauncher();
  });

  afterEach(() => {
    if (mockServer) {
      mockServer.close();
      mockServer = null;
    }
  });

  it('detects reachable Chrome DevTools endpoint when running', async () => {
    mockServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          Browser: 'Chrome/120.0.0.0',
          'Protocol-Version': '1.3',
          webSocketDebuggerUrl: 'ws://127.0.0.1:19222/devtools/browser/abc',
        })
      );
    });

    await new Promise<void>((resolve) => {
      mockServer?.listen(testPort, '127.0.0.1', () => resolve());
    });

    const status = await launcher.probeChrome(testPort);
    expect(status.running).toBe(true);
    expect(status.port).toBe(testPort);
    expect(status.browserVersion).toBe('Chrome/120.0.0.0');
    expect(status.wsEndpoint).toContain('ws://127.0.0.1:19222');
  });

  it('reports not running when port is unreachable', async () => {
    const status = await launcher.probeChrome(19223);
    expect(status.running).toBe(false);
    expect(status.port).toBe(19223);
  });

  it('handles invalid HTTP response code gracefully', async () => {
    mockServer = http.createServer((_req, res) => {
      res.writeHead(500);
      res.end('Server Error');
    });

    await new Promise<void>((resolve) => {
      mockServer?.listen(testPort, '127.0.0.1', () => resolve());
    });

    const status = await launcher.probeChrome(testPort);
    expect(status.running).toBe(false);
    expect(status.error).toContain('HTTP 500');
  });

  it('finds executable if explicit override path exists', () => {
    const result = launcher.findChromeExecutable(__filename);
    expect(result).toBe(__filename);
  });
});
