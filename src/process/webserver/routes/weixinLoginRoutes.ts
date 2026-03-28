/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import type { RequestHandler } from 'express';
import { startLogin } from '@process/channels/plugins/weixin/WeixinLogin';

/**
 * Register WeChat QR-code login SSE route for WebUI mode.
 *
 * GET /api/channel/weixin/login
 *   Opens an SSE stream and runs the WeChat iLink login flow.
 *   Emits events: qr | scanned | done | error
 *
 *   qr event: { qrcodeData: string } — the page URL to encode as QR image on the client.
 *   (WeChat's QR page encodes window.location.href, which is the qrcode_img_content URL.)
 */
export function registerWeixinLoginRoutes(app: Express, validateApiAccess: RequestHandler): void {
  app.get('/api/channel/weixin/login', validateApiAccess, (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const handle = startLogin({
      onQR: (pageUrl, _qrcodeData) => {
        send('qr', { qrcodeData: pageUrl });
      },
      onScanned: () => {
        send('scanned', {});
      },
      onDone: (result) => {
        send('done', result);
        res.end();
      },
      onError: (error) => {
        send('error', { message: error.message });
        res.end();
      },
    });

    req.on('close', () => {
      handle.abort();
    });
  });
}
