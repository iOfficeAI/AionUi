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

const h = vi.hoisted(() => ({ readContent: vi.fn(), getContentMetadata: vi.fn(), resolveRef: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: { readContent: { invoke: h.readContent }, getContentMetadata: { invoke: h.getContentMetadata } },
    project: { resolveRef: { invoke: h.resolveRef } },
  },
}));

import { formatSizeAboveLimit, resolvePreviewPayload, upgradeFileRef } from '@/renderer/utils/file/previewPayload';

const TEXT_CEILING = 1024 * 1024;
const IMAGE_CEILING = 20 * 1024 * 1024;

const ref = { kind: 'local' as const, path: '/abs/file.txt' };

const MB = 1024 * 1024;

/** Mirrors the app's byte formatter, with selectable precision. */
const format = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
};

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

// The oversized notice has to state two sizes that differ. At the default 2 decimals
// a file one byte over a 1 MB ceiling also renders as "1 MB", so the sentence became
// "1 MB exceeds 1 MB" — which reads as a bug in the app, not an explanation.
describe('formatSizeAboveLimit', () => {
  it('never renders the size identically to the limit it exceeded', () => {
    expect(formatSizeAboveLimit(MB + 1, MB, format)).not.toBe(format(MB));
  });

  it.each([MB + 1, MB + 100, MB + 5000, MB + 50_000])('distinguishes %i bytes from a 1 MB limit', (size) => {
    expect(formatSizeAboveLimit(size, MB, format)).not.toBe(format(MB));
  });

  // Asserting only "differs from the limit" is not enough: the `> 1 MB` fallback
  // also differs, so a version that never raised precision would still pass. These
  // pin that extra precision is genuinely used when it can separate the two, and
  // that the fallback is reserved for when it truly cannot.
  it('raises precision rather than falling back when a real number can separate them', () => {
    expect(formatSizeAboveLimit(MB + 5000, MB, format)).toBe('1.005 MB');
  });

  it('shows an exact figure at the precision that first distinguishes it', () => {
    expect(formatSizeAboveLimit(MB + 100, MB, format)).toBe('1.0001 MB');
  });

  it('reserves the fallback for differences no precision can show', () => {
    // One byte over: even 4 decimals still renders "1 MB".
    expect(formatSizeAboveLimit(MB + 1, MB, format)).toBe('> 1 MB');
  });

  it('leaves comfortably larger sizes formatted normally', () => {
    expect(formatSizeAboveLimit(5 * MB, MB, format)).toBe('5 MB');
    expect(formatSizeAboveLimit(1.2 * MB, MB, format)).toBe('1.2 MB');
  });

  // A one-byte difference cannot be shown at any sane precision, so state the
  // relationship rather than print a number that still rounds to the limit.
  it('falls back to a "greater than" phrasing when no precision separates them', () => {
    const out = formatSizeAboveLimit(MB + 1, MB, (bytes, decimals = 2) =>
      // A formatter that always collapses to the same text, worst case.
      decimals >= 0 ? '1 MB' : '1 MB'
    );
    expect(out).toBe('> 1 MB');
  });

  it('works for the image ceiling too', () => {
    const imageCeiling = 20 * MB;
    expect(formatSizeAboveLimit(imageCeiling + 1, imageCeiling, format)).not.toBe(format(imageCeiling));
  });
});

// One file described two ways — a project ref from the explorer, an absolute path
// from a chat link — is still one file. Resolving to the stronger identity before
// opening is what keeps it as one tab and lets it receive change signals; the
// backend decides, because "same path" depends on per-platform case folding.
describe('upgradeFileRef', () => {
  const localRef = { kind: 'local' as const, path: '/ws/proj/src/a.ts' };
  const projectRef = { kind: 'project' as const, pe_id: 'peA', relative_path: 'src/a.ts' };

  beforeEach(() => {
    h.resolveRef.mockReset();
  });

  it('returns the upgraded ref the backend resolved', async () => {
    h.resolveRef.mockResolvedValue({ file: projectRef, upgraded: true });

    await expect(upgradeFileRef(localRef, 'proj-1')).resolves.toEqual(projectRef);
    expect(h.resolveRef).toHaveBeenCalledWith({ project_id: 'proj-1', file: localRef });
  });

  it('keeps the local ref when the file lives outside every root', async () => {
    h.resolveRef.mockResolvedValue({ file: localRef, upgraded: false });

    await expect(upgradeFileRef(localRef, 'proj-1')).resolves.toEqual(localRef);
  });

  // No project means no roots to resolve against, and inventing one would compare
  // the path against the wrong project's roots.
  it('skips the request entirely when there is no current project', async () => {
    await expect(upgradeFileRef(localRef, null)).resolves.toEqual(localRef);
    expect(h.resolveRef).not.toHaveBeenCalled();
  });

  it.each([
    ['project', { kind: 'project' as const, pe_id: 'peA', relative_path: 'src/a.ts' }],
    ['upload', { kind: 'upload' as const, path: '/managed/uploads/a.ts' }],
  ])('does not spend a round trip on an already-terminal %s ref', async (_label, terminalRef) => {
    await expect(upgradeFileRef(terminalRef, 'proj-1')).resolves.toEqual(terminalRef);
    expect(h.resolveRef).not.toHaveBeenCalled();
  });

  // Losing the upgrade costs dedup and automatic signals; failing the open would
  // cost the user the file. The first is the better trade.
  it('falls back to the original ref when the request fails', async () => {
    h.resolveRef.mockRejectedValue(new Error('offline'));

    await expect(upgradeFileRef(localRef, 'proj-1')).resolves.toEqual(localRef);
  });
});
