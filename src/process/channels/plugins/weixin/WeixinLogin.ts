/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import https from 'https';

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const BOT_TYPE = '3';
const POLL_TIMEOUT_MS = 35_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_QR_RETRIES = 3;

export interface LoginCallbacks {
  /** @param qrcodeUrl  The page/image URL from the API (used in Electron to render via canvas).
   *  @param qrcodeData The raw QR code ticket — encode this directly when generating your own image. */
  onQR: (qrcodeUrl: string, qrcodeData: string) => void;
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

    // GET /ilink/bot/get_bot_qrcode?bot_type=3
    // Response: { qrcode: string (ticket), qrcode_img_content: string (image URL) }
    // oxlint-disable-next-line eslint/no-await-in-loop
    const qrResult = await get<{ qrcode: string; qrcode_img_content: string }>(
      DEFAULT_BASE_URL,
      `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(BOT_TYPE)}`,
      signal
    );
    if (!qrResult.qrcode_img_content || !qrResult.qrcode) {
      throw new Error(`Invalid QR code response: ${JSON.stringify(qrResult)}`);
    }
    callbacks.onQR(qrResult.qrcode_img_content, qrResult.qrcode);

    // oxlint-disable-next-line eslint/no-await-in-loop
    const pollResult = await pollQRStatus(qrResult.qrcode, callbacks, signal);

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

async function pollQRStatus(qrcode: string, callbacks: LoginCallbacks, signal: AbortSignal): Promise<PollResult> {
  while (!signal.aborted) {
    // GET /ilink/bot/get_qrcode_status?qrcode=<qrcode>
    // Response: { status, bot_token?, ilink_bot_id?, ilink_user_id?, baseurl? }
    let result: {
      status: 'wait' | 'scaned' | 'expired' | 'confirmed';
      bot_token?: string;
      baseurl?: string;
      ilink_bot_id?: string;
      ilink_user_id?: string;
    };
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop
      result = await get(
        DEFAULT_BASE_URL,
        `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
        signal,
        POLL_TIMEOUT_MS
      );
    } catch (error) {
      // Long-poll timeout is expected — treat as "wait" and retry, same as the SDK
      if (error instanceof Error && error.message.startsWith('Timeout:')) {
        continue;
      }
      throw error;
    }

    switch (result.status) {
      case 'wait':
        break;
      case 'scaned':
        callbacks.onScanned();
        break;
      case 'expired':
        return 'expired';
      case 'confirmed':
        if (!result.bot_token || !result.ilink_bot_id) {
          throw new Error('Missing bot_token or ilink_bot_id in confirmed response');
        }
        return {
          accountId: result.ilink_bot_id,
          botToken: result.bot_token,
          baseUrl: result.baseurl || DEFAULT_BASE_URL,
        };
    }
  }

  return 'aborted';
}

function get<T>(
  baseUrl: string,
  pathWithQuery: string,
  signal: AbortSignal,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const url = new URL(pathWithQuery, base);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        'iLink-App-ClientVersion': '1',
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            reject(new Error(`HTTP ${res.statusCode} from ${pathWithQuery}: ${raw}`));
            return;
          }
          resolve(JSON.parse(raw) as T);
        } catch {
          reject(new Error(`Invalid JSON response from ${pathWithQuery}: ${raw}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      if (typeof req.destroy === 'function') req.destroy(new Error(`Timeout: ${pathWithQuery}`));
    });

    const onAbort = () => {
      if (typeof req.destroy === 'function') req.destroy(new Error('Aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    req.on('close', () => signal.removeEventListener('abort', onAbort));

    req.end();
  });
}
