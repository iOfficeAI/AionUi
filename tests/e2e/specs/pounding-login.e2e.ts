/**
 * POUNDING Login E2E Test
 *
 * Tests login flow against the POUNDING NewAPI.
 * Logs response details for debugging.
 */
import { test, expect } from '@playwright/test';

const NEW_API = 'https://api.mxou.cn';

async function tryLogin(username: string, password: string) {
  // Try different login paths
  const paths = ['/api/login', '/api/auth/login', '/api/user/login'];
  for (const path of paths) {
    const res = await fetch(`${NEW_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok || res.status !== 404) {
      return { path, status: res.status, body: await res.text() };
    }
  }
  // Also try with email field
  const res = await fetch(`${NEW_API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: username, password }),
  });
  return { path: '/api/login', status: res.status, body: await res.text() };
}

test.describe('POUNDING Login', () => {
  test('login endpoint responds', async () => {
    const result = await tryLogin('haloclawroot', 'Haloclaw2026!');
    console.log(`Path: ${result.path}, Status: ${result.status}`);
    console.log(`Body (first 500 chars): ${result.body.substring(0, 500)}`);

    // The endpoint should at least exist (not 404)
    expect(result.status).not.toBe(404);
  });
});
