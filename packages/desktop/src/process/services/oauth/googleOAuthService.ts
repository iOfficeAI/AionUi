/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http';
import { randomUUID } from 'crypto';
import { shell } from 'electron';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
];

export type GoogleOAuthResult = {
  success: boolean;
  email?: string;
  name?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
};

export async function loginWithGoogleInBrowser(): Promise<GoogleOAuthResult> {
  return new Promise((resolve) => {
    let server: http.Server | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let resolved = false;

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (server) {
        server.close();
        server = null;
      }
    };

    const finish = (result: GoogleOAuthResult) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
        if (reqUrl.pathname !== '/callback' && reqUrl.pathname !== '/auth/callback') {
          res.writeHead(404).end();
          return;
        }

        const code = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');

        if (error || !code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><title>AionUi - Login Cancelled</title></head>
            <body style="font-family:system-ui,-apple-system,sans-serif;padding:3rem;text-align:center;background:#18181b;color:#f4f4f5">
              <h2 style="color:#ef4444">Authentication Cancelled</h2>
              <p style="color:#a1a1aa">${error || 'No authorization code received'}</p>
              <p style="color:#71717a;font-size:13px">You can close this tab and return to AionUi.</p>
            </body>
            </html>
          `);
          finish({ success: false, error: error || 'Authentication cancelled by user' });
          return;
        }

        // Serve success page
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>AionUi - Connected</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #121214; color: #fff; }
              .card { text-align: center; background: #1e1e22; padding: 40px; border-radius: 16px; border: 1px solid #2e2e34; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
              .icon { width: 52px; height: 52px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; font-size: 26px; }
              h2 { margin: 0 0 10px; font-size: 22px; font-weight: 600; }
              p { color: #a1a1aa; font-size: 14px; margin: 0; line-height: 1.5; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon">✓</div>
              <h2>Google Account Connected!</h2>
              <p>Authentication was successful. You can close this browser tab and return to AionUi.</p>
            </div>
            <script>setTimeout(() => window.close(), 3000);</script>
          </body>
          </html>
        `);

        // Exchange authorization code for tokens
        const address = server?.address();
        const port = typeof address === 'object' && address ? address.port : 51234;
        const redirectUri = `http://127.0.0.1:${port}/callback`;

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
          }),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          finish({ success: false, error: `Token exchange failed: ${errText}` });
          return;
        }

        const tokenData = (await tokenRes.json()) as {
          access_token: string;
          refresh_token?: string;
        };

        // Fetch user email and name
        let email = 'Google Account';
        let name = 'Google User';
        try {
          const userRes = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          if (userRes.ok) {
            const userData = (await userRes.json()) as { email?: string; name?: string };
            if (userData.email) email = userData.email;
            if (userData.name) name = userData.name;
          }
        } catch {
          // ignore userinfo failure
        }

        finish({
          success: true,
          email,
          name,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        finish({ success: false, error: errorMsg });
      }
    });

    server.on('error', (err) => {
      finish({ success: false, error: `Server error: ${err.message}` });
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server?.address();
      if (!address || typeof address !== 'object') {
        finish({ success: false, error: 'Could not resolve loopback server port' });
        return;
      }

      const port = address.port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const state = randomUUID();

      const authUrl =
        'https://accounts.google.com/o/oauth2/v2/auth?' +
        new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          response_type: 'code',
          redirect_uri: redirectUri,
          scope: GOOGLE_SCOPES.join(' '),
          state,
          access_type: 'offline',
          prompt: 'consent',
        }).toString();

      // Open user's default browser directly to Google Sign-In
      void shell.openExternal(authUrl);

      // Timeout after 2 minutes if user doesn't complete login
      timeoutTimer = setTimeout(() => {
        finish({ success: false, error: 'Authentication timed out (exceeded 2 minutes)' });
      }, 120_000);
    });
  });
}
