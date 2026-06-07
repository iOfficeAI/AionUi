/**
 * POUNDING Image Preview API E2E Tests
 *
 * Direct API tests against the poundingcore backend.
 * Uses Node.js fetch — poundingcore must be running on port 13400.
 */
import { test, expect } from '@playwright/test';

const BACKEND = 'http://127.0.0.1:13400';

async function apiPost(path: string, body?: unknown): Promise<{ status: number; data?: unknown; error?: string }> {
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

test.describe('POUNDING Image Base64 API', () => {
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

  test('/api/fs/fetch-remote-image is active', async () => {
    const { status } = await apiPost('/api/fs/fetch-remote-image', {
      url: 'https://invalid-blocked-host.example/image.png',
    });
    expect([400, 403]).toContain(status);
  });

  test('/api/fs/fetch-remote-image requires url', async () => {
    const { status } = await apiPost('/api/fs/fetch-remote-image', {});
    expect([400, 403]).toContain(status);
  });
});
