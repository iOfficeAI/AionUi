/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import https from 'https';

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const POLL_TIMEOUT_MS = 35_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_QR_RETRIES = 3;

export interface LoginCallbacks {
  onQR: (qrcodeUrl: string) => void;
  onScanned: () => void;
  onDone: (result: { accountId: string; botToken: string; baseUrl: string }) => void;
  onError: (error: Error) => void;
}

export interface LoginHandle {
  abort: () => void;
}

/**
 * Start the WeChat QR-code login flow.
 * Calls two WeChat iLink Bot API endpoints directly (SDK login() is terminal-only).
 */
export function startLogin(callbacks: LoginCallbacks): LoginHandle {
  const abortController = new AbortController();

  void runLoginFlow(callbacks, abortController.signal).catch((error) => {
    if (!abortController.signal.aborted) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  });

  return { abort: () => abortController.abort() };
}

async function runLoginFlow(callbacks: LoginCallbacks, signal: AbortSignal): Promise<void> {
  let qrRetries = 0;

  while (qrRetries < MAX_QR_RETRIES) {
    if (signal.aborted) return;

    const qrResult = await post<{ qrcode_url: string; ticket: string }>(
      DEFAULT_BASE_URL,
      'ilink/bot/get_bot_qrcode',
      {},
      signal
    );
    callbacks.onQR(qrResult.qrcode_url);

    const pollResult = await pollQRStatus(qrResult.ticket, callbacks, signal);

    if (pollResult === 'expired') {
      qrRetries++;
      continue;
    }
    if (pollResult === 'aborted') return;

    callbacks.onDone(pollResult as { accountId: string; botToken: string; baseUrl: string });
    return;
  }

  callbacks.onError(new Error('QR code expired too many times'));
}

type PollResult = 'expired' | 'aborted' | { accountId: string; botToken: string; baseUrl: string };

async function pollQRStatus(ticket: string, callbacks: LoginCallbacks, signal: AbortSignal): Promise<PollResult> {
  while (!signal.aborted) {
    const result = await post<{
      status: 'wait' | 'scaned' | 'expired' | 'confirmed';
      botToken?: string;
      baseUrl?: string;
      userId?: string;
    }>(DEFAULT_BASE_URL, 'ilink/bot/get_qrcode_status', { ticket }, signal, POLL_TIMEOUT_MS);

    switch (result.status) {
      case 'wait':
        break;
      case 'scaned':
        callbacks.onScanned();
        break;
      case 'expired':
        return 'expired';
      case 'confirmed':
        if (!result.botToken || !result.userId) {
          throw new Error('Missing botToken or userId in confirmed response');
        }
        return {
          accountId: result.userId,
          botToken: result.botToken,
          baseUrl: result.baseUrl || DEFAULT_BASE_URL,
        };
    }
  }

  return 'aborted';
}

function post<T>(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const data = JSON.stringify(body);
    const url = new URL(path, baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data).toString(),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw) as T);
        } catch {
          reject(new Error(`Invalid JSON response from ${path}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      if (typeof req.destroy === 'function') req.destroy(new Error(`Timeout: ${path}`));
    });

    const onAbort = () => {
      if (typeof req.destroy === 'function') req.destroy(new Error('Aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    req.on('close', () => signal.removeEventListener('abort', onAbort));

    req.write(data);
    req.end();
  });
}
