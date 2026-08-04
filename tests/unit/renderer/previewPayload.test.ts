/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Coverage for the single decision point every preview entry point funnels
// through. Two invariants matter here and are asserted directly:
//
//  1. Oversized files are NEVER read. Reading part of a file and handing it to a
//     saveable editor is what destroyed the unread remainder on save.
//  2. size and lastModified come from ONE metadata call. lastModified becomes the
//     save-time If-Match; without it the backend skips conflict detection and
//     silently overwrites a concurrent external edit.

import { describe, expect, it, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ readContent: vi.fn(), getContentMetadata: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: { readContent: { invoke: h.readContent }, getContentMetadata: { invoke: h.getContentMetadata } },
  },
}));

import { resolvePreviewPayload } from '@/renderer/utils/file/previewPayload';

const TEXT_CEILING = 1024 * 1024;
const IMAGE_CEILING = 20 * 1024 * 1024;

const ref = { kind: 'local' as const, path: '/abs/file.txt' };

const meta = (size: number, lastModified = 1_700_000_000_000) => ({
  name: 'file.txt',
  path: '/abs/file.txt',
  size,
  type: 'file',
  lastModified,
});

beforeEach(() => {
  h.readContent.mockReset().mockResolvedValue('content');
  h.getContentMetadata.mockReset().mockResolvedValue(meta(10));
});

describe('resolvePreviewPayload', () => {
  it('takes size and lastModified from a single metadata call', async () => {
    h.getContentMetadata.mockResolvedValue(meta(42, 1_777_000_000_999));

    const out = await resolvePreviewPayload(ref, 'code');

    expect(h.getContentMetadata).toHaveBeenCalledTimes(1);
    expect(h.getContentMetadata).toHaveBeenCalledWith({ file: ref });
    expect(out.sizeBytes).toBe(42);
    expect(out.lastModified).toBe(1_777_000_000_999);
  });

  it.each<[string, 'code' | 'markdown' | 'html' | 'diff']>([
    ['code', 'code'],
    ['markdown', 'markdown'],
    ['html', 'html'],
    ['diff', 'diff'],
  ])('reads %s as utf8 when within the ceiling', async (_label, contentType) => {
    const out = await resolvePreviewPayload(ref, contentType);

    expect(h.readContent).toHaveBeenCalledWith({ file: ref, encoding: 'utf8' });
    expect(out.content).toBe('content');
    expect(out.oversized).toBe(false);
    expect(out.thresholdBytes).toBe(TEXT_CEILING);
  });

  it('reads images as a data URL and applies the 20MB ceiling', async () => {
    h.getContentMetadata.mockResolvedValue(meta(19 * 1024 * 1024));
    h.readContent.mockResolvedValue('data:image/png;base64,QQ==');

    const out = await resolvePreviewPayload(ref, 'image');

    expect(h.readContent).toHaveBeenCalledWith({ file: ref, encoding: 'dataurl' });
    expect(out.content).toBe('data:image/png;base64,QQ==');
    expect(out.oversized).toBe(false);
    expect(out.thresholdBytes).toBe(IMAGE_CEILING);
  });

  it.each<'pdf' | 'word' | 'excel' | 'ppt'>(['pdf', 'word', 'excel', 'ppt'])(
    'never reads %s and applies no ceiling',
    async (contentType) => {
      // Deliberately enormous: these render from a stream / their own process, so
      // a size ceiling would be meaningless.
      h.getContentMetadata.mockResolvedValue(meta(900 * 1024 * 1024));

      const out = await resolvePreviewPayload(ref, contentType);

      expect(h.readContent).not.toHaveBeenCalled();
      expect(out.content).toBe('');
      expect(out.oversized).toBe(false);
      expect(out.thresholdBytes).toBeUndefined();
      // Metadata is still fetched — it is what keeps the missing-file check alive
      // and supplies the save-time timestamp.
      expect(h.getContentMetadata).toHaveBeenCalledTimes(1);
    }
  );

  describe('the size gate', () => {
    it('does not read an oversized text file', async () => {
      h.getContentMetadata.mockResolvedValue(meta(TEXT_CEILING + 1));

      const out = await resolvePreviewPayload(ref, 'code');

      expect(h.readContent).not.toHaveBeenCalled();
      expect(out.content).toBe('');
      expect(out.oversized).toBe(true);
      expect(out.sizeBytes).toBe(TEXT_CEILING + 1);
      expect(out.thresholdBytes).toBe(TEXT_CEILING);
    });

    it('does not read an oversized image', async () => {
      h.getContentMetadata.mockResolvedValue(meta(IMAGE_CEILING + 1));

      const out = await resolvePreviewPayload(ref, 'image');

      expect(h.readContent).not.toHaveBeenCalled();
      expect(out.oversized).toBe(true);
    });

    it('still reports lastModified for an oversized file', async () => {
      h.getContentMetadata.mockResolvedValue(meta(TEXT_CEILING + 1, 1_733_000_000_000));

      const out = await resolvePreviewPayload(ref, 'code');

      expect(out.lastModified).toBe(1_733_000_000_000);
    });

    // "Larger than 1MB" must not reject a file of exactly 1MB.
    it('treats a file exactly at the ceiling as within it', async () => {
      h.getContentMetadata.mockResolvedValue(meta(TEXT_CEILING));

      const out = await resolvePreviewPayload(ref, 'code');

      expect(h.readContent).toHaveBeenCalled();
      expect(out.oversized).toBe(false);
    });

    it('treats one byte over the ceiling as oversized', async () => {
      h.getContentMetadata.mockResolvedValue(meta(TEXT_CEILING + 1));
      const out = await resolvePreviewPayload(ref, 'code');
      expect(out.oversized).toBe(true);
    });
  });

  it('propagates a metadata failure so callers can show their missing-file state', async () => {
    h.getContentMetadata.mockRejectedValue(new Error('not found'));

    await expect(resolvePreviewPayload(ref, 'code')).rejects.toThrow('not found');
    expect(h.readContent).not.toHaveBeenCalled();
  });

  it('normalizes a null content read to an empty string', async () => {
    h.readContent.mockResolvedValue(null);

    const out = await resolvePreviewPayload(ref, 'code');

    expect(out.content).toBe('');
  });
});
