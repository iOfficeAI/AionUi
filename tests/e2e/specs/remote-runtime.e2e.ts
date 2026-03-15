import { WebSocket } from 'ws';
import { test, expect } from '../fixtures';
import { invokeBridge } from '../helpers';

type EnsureWebuiResult = {
  port: number;
  startedByTest: boolean;
};

type BridgeResult<T> = {
  success?: boolean;
  data?: T;
  msg?: string;
};

type WsEnvelope = {
  name?: string;
  data?: unknown;
};

async function ensureWebuiRunning(page: import('@playwright/test').Page): Promise<EnsureWebuiResult | null> {
  const status = (await invokeBridge(page, 'webui.get-status')) as BridgeResult<{ running?: boolean; port?: number }>;

  if (status?.success && status.data?.running) {
    return {
      port: typeof status.data.port === 'number' ? status.data.port : 25808,
      startedByTest: false,
    };
  }

  const started = (await invokeBridge(page, 'webui.start', { port: 26330 })) as BridgeResult<{ port?: number }>;
  if (!started?.success) {
    console.warn(`[E2E] WebUI service unavailable: ${started?.msg || 'unknown error'}`);
    return null;
  }

  return {
    port: typeof started.data?.port === 'number' ? started.data.port : 25808,
    startedByTest: true,
  };
}

async function stopWebuiIfStarted(page: import('@playwright/test').Page, startedByTest: boolean): Promise<void> {
  if (!startedByTest) return;
  await invokeBridge(page, 'webui.stop');
}

async function loginByQr(page: import('@playwright/test').Page, port: number): Promise<string> {
  const qr = (await invokeBridge(page, 'webui.generate-qr-token')) as BridgeResult<{ token?: string }>;

  if (!qr.success || !qr.data?.token) {
    throw new Error(`Failed to generate QR token: ${qr.msg || 'unknown error'}`);
  }

  const response = await fetch(`http://localhost:${port}/api/auth/qr-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qrToken: qr.data.token }),
  });

  const payload = (await response.json()) as { success?: boolean; token?: string; error?: string };
  if (!response.ok || !payload.success || !payload.token) {
    throw new Error(`QR login failed: ${payload.error || response.statusText}`);
  }

  return payload.token;
}

async function requestJson<T>(url: string, token: string, init?: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function waitForOpen(ws: WebSocket, timeoutMs = 5_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), timeoutMs);

    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });

    ws.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function waitForWsMessage(ws: WebSocket, predicate: (message: WsEnvelope) => boolean, timeoutMs = 8_000): Promise<WsEnvelope> {
  return new Promise<WsEnvelope>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('WebSocket message timeout'));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(String(raw)) as WsEnvelope;
        if (!predicate(parsed)) return;
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(parsed);
      } catch {
        // ignore non-json payloads
      }
    };

    ws.on('message', onMessage);
  });
}

test.describe('Remote Runtime API + WebSocket', () => {
  test('rejects unauthenticated remote API access', async ({ page }) => {
    const webui = await ensureWebuiRunning(page);
    if (!webui) {
      test.skip(true, 'WebUI service unavailable (native module issue)');
      return;
    }

    const { port, startedByTest } = webui;

    try {
      const response = await fetch(`http://localhost:${port}/api/remote/overview`);
      expect(response.status).toBe(403);
    } finally {
      await stopWebuiIfStarted(page, startedByTest);
    }
  });

  test('supports remote API session/approval/tunnel workflow', async ({ page }) => {
    const webui = await ensureWebuiRunning(page);
    if (!webui) {
      test.skip(true, 'WebUI service unavailable (native module issue)');
      return;
    }

    const { port, startedByTest } = webui;

    try {
      const token = await loginByQr(page, port);

      const overview = await requestJson<{ success: boolean; data: { devices: unknown[]; sessions: unknown[] } }>(`http://localhost:${port}/api/remote/overview`, token);
      expect(overview.success).toBe(true);
      expect(Array.isArray(overview.data.devices)).toBe(true);

      const createdSession = await requestJson<{ success: boolean; data: { id: string; title: string } }>(`http://localhost:${port}/api/remote/sessions`, token, {
        method: 'POST',
        body: JSON.stringify({ title: 'e2e remote session', metadata: { from: 'e2e' } }),
      });
      expect(createdSession.success).toBe(true);

      const sessions = await requestJson<{ success: boolean; data: Array<{ id: string }> }>(`http://localhost:${port}/api/remote/sessions`, token);
      expect(sessions.data.some((item) => item.id === createdSession.data.id)).toBe(true);

      const createdApproval = await requestJson<{ success: boolean; data: { id: string; status: string } }>(`http://localhost:${port}/api/remote/approvals`, token, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Approve e2e action',
          summary: 'approval from e2e',
          sessionId: createdSession.data.id,
        }),
      });
      expect(createdApproval.data.status).toBe('pending');

      const resolvedApproval = await requestJson<{ success: boolean; data: { status: string } }>(`http://localhost:${port}/api/remote/approvals/${createdApproval.data.id}/resolve`, token, {
        method: 'POST',
        body: JSON.stringify({ status: 'approved', note: 'ok' }),
      });
      expect(resolvedApproval.data.status).toBe('approved');

      const startedTunnel = await requestJson<{ success: boolean; data: { enabled: boolean; provider: string } }>(`http://localhost:${port}/api/remote/tunnel/start`, token, {
        method: 'POST',
        body: JSON.stringify({ provider: 'custom' }),
      });
      expect(startedTunnel.data.enabled).toBe(true);
      expect(startedTunnel.data.provider).toBe('custom');

      const stoppedTunnel = await requestJson<{ success: boolean; data: { enabled: boolean; provider: string } }>(`http://localhost:${port}/api/remote/tunnel/stop`, token, { method: 'POST', body: JSON.stringify({}) });
      expect(stoppedTunnel.data.enabled).toBe(false);
      expect(stoppedTunnel.data.provider).toBe('none');
    } finally {
      await stopWebuiIfStarted(page, startedByTest);
    }
  });

  test('supports remote websocket snapshot/session/approval flow', async ({ page }) => {
    const webui = await ensureWebuiRunning(page);
    if (!webui) {
      test.skip(true, 'WebUI service unavailable (native module issue)');
      return;
    }

    const { port, startedByTest } = webui;
    const token = await loginByQr(page, port);
    const deviceId = `e2e-device-${Date.now()}`;

    const ws = new WebSocket(`ws://localhost:${port}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-aionui-device-id': deviceId,
      },
    });

    try {
      const snapshotPromise = waitForWsMessage(ws, (message) => message.name === 'remote.snapshot');
      await waitForOpen(ws);

      const snapshot = await snapshotPromise;
      expect(snapshot.name).toBe('remote.snapshot');

      const sessionId = `e2e-ws-session-${Date.now()}`;

      ws.send(JSON.stringify({ name: 'remote.session.open', data: { sessionId, title: 'ws session' } }));
      const opened = await waitForWsMessage(ws, (message) => message.name === 'remote.session.opened');
      expect((opened.data as { id?: string })?.id).toBe(sessionId);

      ws.send(JSON.stringify({ name: 'remote.session.attach', data: { sessionId } }));
      const attached = await waitForWsMessage(ws, (message) => message.name === 'remote.session.attached');
      expect(((attached.data as { attachedDeviceIds?: string[] })?.attachedDeviceIds ?? []).includes(deviceId)).toBe(true);

      ws.send(
        JSON.stringify({
          name: 'remote.approval.create',
          data: {
            title: 'ws approval',
            summary: 'approve via websocket',
            sessionId,
          },
        })
      );
      const created = await waitForWsMessage(ws, (message) => message.name === 'remote.approval.created');
      const approvalId = (created.data as { id?: string })?.id;
      expect(typeof approvalId).toBe('string');

      ws.send(JSON.stringify({ name: 'remote.approval.resolve', data: { approvalId, status: 'approved', note: 'done' } }));
      const resolved = await waitForWsMessage(ws, (message) => message.name === 'remote.approval.resolved');
      expect((resolved.data as { status?: string })?.status).toBe('approved');
    } finally {
      ws.close();
      await stopWebuiIfStarted(page, startedByTest);
    }
  });
});
