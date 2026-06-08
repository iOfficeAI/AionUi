/**
 * POUNDING Backend API E2E Tests
 *
 * Direct API tests against the poundingcore backend (port 13400).
 * Uses Node.js fetch — does NOT go through Electron renderer context.
 * poundingcore must be running: poundingcore --port 13400
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://127.0.0.1:13400';

async function apiGet<T = unknown>(path: string): Promise<{ status: number; data?: T; error?: string }> {
  const res = await fetch(`${BACKEND}${path}`);
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, error: text };
  }
}

async function apiPost<T = unknown>(
  path: string,
  body?: unknown
): Promise<{ status: number; data?: T; error?: string }> {
  const res = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, error: text };
  }
}

test.describe('POUNDING Backend Health', () => {
  test('/health returns ok with version', async () => {
    const { status, data } = await apiGet('/health');
    expect(status).toBe(200);
    expect(data).toBeDefined();
    expect((data as Record<string, unknown>).status).toBe('ok');
    expect((data as Record<string, unknown>).version).toBeTruthy();
  });
});

test.describe('POUNDING Agent API', () => {
  test('/api/agents responds (auth gated)', async () => {
    const { status } = await apiGet('/api/agents');
    // 403=Forbidden (auth required), 200=OK (authenticated)
    expect([200, 401, 403]).toContain(status);
  });

  test('/api/providers responds (auth gated)', async () => {
    const { status } = await apiGet('/api/providers');
    expect([200, 401, 403]).toContain(status);
  });
});

test.describe('POUNDING File API', () => {
  test('/api/fs/image-base64 rejects missing file', async () => {
    const { status } = await apiPost('/api/fs/image-base64', {
      path: '/nonexistent/image.png',
      workspace: '/tmp',
    });
    // 400=bad request, 403=CSRF, 404=not found — endpoint is active
    expect([400, 403, 404]).toContain(status);
  });

  test('/api/fs/image-base64 rejects empty body', async () => {
    const { status } = await apiPost('/api/fs/image-base64', {});
    expect([400, 403, 404]).toContain(status);
  });

  test('/api/fs/fetch-remote-image endpoint active', async () => {
    const { status } = await apiPost('/api/fs/fetch-remote-image', {
      url: 'https://invalid-blocked-host.example/image.png',
    });
    expect([400, 403]).toContain(status);
  });
});
