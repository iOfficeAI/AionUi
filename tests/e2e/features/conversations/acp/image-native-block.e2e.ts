/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Multimodal prompt E2E: uploading an image in the send box must reach a
 * capability-declaring agent (claude direct) as a NATIVE image content block,
 * not as a file path.
 *
 * Evidence asserted:
 * 1. The conversation detail response projects `prompt_capability.image=true`.
 * 2. The AI reply describes the pixel content of a generated probe PNG (a red
 *    square on a blue background) with tool use forbidden — only the base64
 *    vision block can deliver the pixels (the upload lives in temp_dir,
 *    outside the workspace, so a Read-tool path cannot reach it either).
 *
 * The aioncore log line `session prompt carries native media content blocks`
 * is the backend-side witness; the runner script greps it after this spec.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { test, expect } from '../../../fixtures';
import { CHAT_INPUT, findAssistantIdForBackend, goToGuid, waitForAiReply } from '../../../helpers';
import { httpGet, httpPost } from '../../../helpers/httpBridge';

type CreatedConversation = { id: string };
type ConversationDetail = { id: string; prompt_capability?: { image: boolean; audio: boolean } };

/** Write a 24x24 PNG: red 12x12 square centered on a blue background. */
function writeProbePng(): string {
  const W = 24;
  const H = 24;
  const rows: Buffer[] = [];
  for (let y = 0; y < H; y++) {
    const row = Buffer.alloc(1 + W * 3);
    for (let x = 0; x < W; x++) {
      const inSquare = x >= 6 && x < 18 && y >= 6 && y < 18;
      row[1 + x * 3] = inSquare ? 255 : 0;
      row[1 + x * 3 + 2] = inSquare ? 0 : 255;
    }
    rows.push(row);
  }
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-img-')), 'probe-red-square.png');
  fs.writeFileSync(file, png);
  return file;
}

async function ensureRendererReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.location.href !== 'about:blank' &&
      typeof (window as unknown as { __backendPort?: number }).__backendPort === 'number',
    { timeout: 30_000 }
  );
}

test.describe('ACP multimodal prompt', () => {
  test('uploaded image reaches claude as a native image block', async ({ page }) => {
    test.setTimeout(300_000);
    await goToGuid(page);
    await ensureRendererReady(page);

    // A fresh instance probes CLI availability asynchronously — poll for an
    // online claude assistant, then fall back to any claude assistant (the
    // send itself will fail honestly if the CLI truly is unusable).
    let assistantId: string | null = null;
    const availabilityDeadline = Date.now() + 60_000;
    while (!assistantId && Date.now() < availabilityDeadline) {
      assistantId = await findAssistantIdForBackend(page, 'claude', { requireAvailable: true });
      if (!assistantId) await page.waitForTimeout(3_000);
    }
    if (!assistantId) {
      const assistants = await httpGet<Array<{ id: string; name: string; agent_status?: string }>>(
        page,
        '/api/assistants'
      );
      console.log(
        '[image-e2e] no online claude assistant, statuses:',
        assistants?.map((a) => `${a.id}:${a.agent_status}`).join(', ')
      );
      assistantId = await findAssistantIdForBackend(page, 'claude');
    }
    test.skip(!assistantId, 'No Claude assistant at all for image-block e2e');
    if (!assistantId) return;

    const conversation = await httpPost<CreatedConversation>(page, '/api/conversations', {
      name: `E2E image native block ${Date.now()}`,
      assistant: { id: assistantId },
      extra: { workspace: os.tmpdir(), custom_workspace: true },
    });
    expect(conversation?.id).toBeTruthy();

    // 1. Capability projection on the detail path.
    const detail = await httpGet<ConversationDetail>(page, `/api/conversations/${conversation.id}`);
    expect(detail?.prompt_capability?.image).toBe(true);

    await page.evaluate((id) => {
      window.location.assign(`#/conversation/${id}`);
    }, conversation.id);
    await page.waitForFunction((id) => window.location.hash === `#/conversation/${id}`, conversation.id, {
      timeout: 15_000,
    });

    // 2. Attach the probe image through the REAL upload input (uploads to
    //    POST /api/fs/upload and lands in the uploadFile chip lane).
    const probePng = writeProbePng();
    const fileInput = page.locator('[data-testid="aionrs-file-upload-input"]');
    await fileInput.setInputFiles(probePng);
    // The image chip renders once the upload finished (alt = file name).
    await expect(page.locator('img[alt="probe-red-square.png"]')).toBeVisible({ timeout: 20_000 });

    // 3. Send with tool use forbidden, so only the vision block can answer.
    const input = page.locator(CHAT_INPUT).first();
    await input.fill(
      'What is in this image? One short sentence naming the shape and both colors. Do not use any tools.'
    );
    await input.press('Enter');

    // 4. The reply must describe the pixels.
    const reply = await waitForAiReply(page, 240_000);
    expect(reply.toLowerCase()).toMatch(/red|红/);
    expect(reply.toLowerCase()).toMatch(/square|正方形|方块/);
  });
});
