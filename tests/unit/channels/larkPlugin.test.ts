import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LarkPlugin } from '@process/channels/plugins/lark/LarkPlugin';

const LARK_UPLOADS_DIR = path.join(os.tmpdir(), 'aionui-lark-uploads');

describe('LarkPlugin.resolveIncomingFiles', () => {
  afterEach(async () => {
    await fs.rm(LARK_UPLOADS_DIR, { recursive: true, force: true });
  });

  it('downloads image attachments through the Lark message resource API', async () => {
    const writeFile = vi.fn(async (filePath: string) => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'image-binary');
    });

    const plugin = new LarkPlugin() as any;
    plugin.client = {
      im: {
        v1: {
          messageResource: {
            get: vi.fn().mockResolvedValue({
              headers: { 'content-type': 'image/png' },
              writeFile,
            }),
          },
        },
      },
    };
    plugin.ensureAccessToken = vi.fn().mockResolvedValue(undefined);

    const files = await plugin.resolveIncomingFiles({
      id: 'msg-1',
      platform: 'lark',
      chatId: 'chat-1',
      user: { id: 'user-1', displayName: 'User 1' },
      content: {
        type: 'photo',
        text: '',
        attachments: [{ type: 'photo', fileId: 'image-key-1' }],
      },
      timestamp: Date.now(),
      raw: { event: { message: { message_type: 'image' } } },
    });

    expect(plugin.client.im.v1.messageResource.get).toHaveBeenCalledWith({
      path: { message_id: 'msg-1', file_key: 'image-key-1' },
      params: { type: 'image' },
    });
    expect(files).toHaveLength(1);
    expect(files?.[0]).toMatch(/attachment-1\.png$/);
    await expect(fs.readFile(files![0], 'utf-8')).resolves.toBe('image-binary');
  });

  it('keeps the original filename for document attachments', async () => {
    const writeFile = vi.fn(async (filePath: string) => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, 'file-binary');
    });

    const plugin = new LarkPlugin() as any;
    plugin.client = {
      im: {
        v1: {
          messageResource: {
            get: vi.fn().mockResolvedValue({
              headers: { 'content-type': 'application/pdf' },
              writeFile,
            }),
          },
        },
      },
    };
    plugin.ensureAccessToken = vi.fn().mockResolvedValue(undefined);

    const files = await plugin.resolveIncomingFiles({
      id: 'msg-2',
      platform: 'lark',
      chatId: 'chat-1',
      user: { id: 'user-1', displayName: 'User 1' },
      content: {
        type: 'document',
        text: '',
        attachments: [{ type: 'document', fileId: 'file-key-1', fileName: 'report.pdf' }],
      },
      timestamp: Date.now(),
      raw: { event: { message: { message_type: 'file' } } },
    });

    expect(files).toHaveLength(1);
    expect(path.basename(files![0])).toBe('report.pdf');
  });
});
