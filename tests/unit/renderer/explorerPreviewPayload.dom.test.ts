/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Coverage for the Explorer file-open payload builder. Every explorer file maps
// to a Project ChatFileRef and goes through the shared resolvePreviewPayload
// gate: one metadata call yields size (the ceiling check) and lastModified (the
// save-time If-Match), then text/image read content over /api/fs/content
// (utf8/dataurl) while pdf/office read none. Oversized files are never read. No
// WS fs/resolve, no file_path/workspace exposed.

import { describe, expect, it, vi } from 'vitest';

// Record ipcBridge.fs calls + script their returns per test.
const h = vi.hoisted(() => ({ readContent: vi.fn(), getContentMetadata: vi.fn() }));

// Isolate the container module from React/UI + WS/IPC side effects; the builder
// under test is a pure async fn needing only fs.readContent + fs.getContentMetadata.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/renderer/pages/conversation/Preview', () => ({ usePreviewContext: () => ({ openPreview: () => {} }) }));
vi.mock('@/common', () => ({
  ipcBridge: {
    project: { get: { invoke: () => Promise.resolve() } },
    fs: { readContent: { invoke: h.readContent }, getContentMetadata: { invoke: h.getContentMetadata } },
  },
}));
vi.mock('@/renderer/pages/conversation/explorer/monitorTransport', () => ({ initExplorerRuntime: () => ({}) }));

import { buildExplorerPreviewPayload } from '@/renderer/pages/conversation/explorer/ExplorerContainer';

const TEXT_CEILING = 1024 * 1024;
const IMAGE_CEILING = 20 * 1024 * 1024;

/** Backend metadata shape (already camelCased by the ipcBridge response map). */
const meta = (size: number, lastModified = 1_700_000_000_000) => ({
  name: 'x',
  path: '/abs/x',
  size,
  type: 'file',
  lastModified,
});

describe('buildExplorerPreviewPayload', () => {
  it('image: reads dataurl content over /content, carries a Project ref, no file_path', async () => {
    h.getContentMetadata.mockReset().mockResolvedValue(meta(1234));
    h.readContent.mockReset().mockResolvedValue('data:image/png;base64,QUJD');
    const out = await buildExplorerPreviewPayload('peA', 'pics/logo.png');

    // Content read by ChatFileRef identity (backend prepends the data-URL prefix).
    expect(h.readContent).toHaveBeenCalledWith({
      file: { kind: 'project', pe_id: 'peA', relative_path: 'pics/logo.png' },
      encoding: 'dataurl',
    });
    expect(out.contentType).toBe('image');
    expect(out.content).toBe('data:image/png;base64,QUJD');
    expect(out.metadata.fileRef).toEqual({ kind: 'project', pe_id: 'peA', relative_path: 'pics/logo.png' });
    expect(out.metadata.editable).toBe(false);
    expect(out.metadata.oversized).toBe(false);
  });

  it('image: empty content stays empty (backend decides encoding/prefix)', async () => {
    h.getContentMetadata.mockReset().mockResolvedValue(meta(10));
    h.readContent.mockReset().mockResolvedValue('');
    const out = await buildExplorerPreviewPayload('peA', 'x.png');
    expect(out.content).toBe('');
  });

  it.each(['reports/q2.pdf', 'r.docx', 's.xlsx', 'd.pptx'])(
    'pdf/office: no content read and no fs/resolve — rendered from the Project ref: %s',
    async (rel) => {
      h.getContentMetadata.mockReset().mockResolvedValue(meta(500));
      h.readContent.mockReset();
      const out = await buildExplorerPreviewPayload('peA', rel);

      expect(h.readContent).not.toHaveBeenCalled(); // never reads content for these
      expect(out.content).toBe('');
      expect(out.metadata.fileRef).toEqual({ kind: 'project', pe_id: 'peA', relative_path: rel });
    }
  );

  // pdf/office carry no size ceiling (nothing is read into an editor), but they
  // still fetch metadata: it is what keeps the missing-file check working and
  // supplies the save-time timestamp.
  it('pdf/office still fetch metadata and carry no threshold', async () => {
    h.getContentMetadata.mockReset().mockResolvedValue(meta(900 * 1024 * 1024));
    h.readContent.mockReset();
    const out = await buildExplorerPreviewPayload('peA', 'huge.pdf');

    expect(h.getContentMetadata).toHaveBeenCalledTimes(1);
    expect(out.metadata.oversized).toBe(false); // no ceiling applies
    expect(out.metadata.thresholdBytes).toBeUndefined();
  });

  it('text: reads utf8 content over /content', async () => {
    h.getContentMetadata.mockReset().mockResolvedValue(meta(7));
    h.readContent.mockReset().mockResolvedValue('# hello');
    const out = await buildExplorerPreviewPayload('peA', 'notes/readme.md');

    expect(h.readContent).toHaveBeenCalledWith({
      file: { kind: 'project', pe_id: 'peA', relative_path: 'notes/readme.md' },
      encoding: 'utf8',
    });
    expect(out.contentType).toBe('markdown');
    expect(out.content).toBe('# hello');
    expect(out.metadata.fileRef).toEqual({ kind: 'project', pe_id: 'peA', relative_path: 'notes/readme.md' });
    // Editable like any other text. It was marked read-only here for a while, which was
    // wrong: markdown is what the panel's editor was built for. Now stated explicitly
    // rather than left undefined, because the value comes from the type table instead of
    // being inferred here.
    expect(out.metadata.editable).toBe(true);
  });

  it('code: reads utf8 and stays editable', async () => {
    h.getContentMetadata.mockReset().mockResolvedValue(meta(3));
    h.readContent.mockReset().mockResolvedValue('x=1');
    const out = await buildExplorerPreviewPayload('peA', 'main.py');
    expect(out.contentType).toBe('code');
    expect(out.content).toBe('x=1');
    expect(out.metadata.editable).toBe(true);
  });

  it('uses the file basename for title/file_name/language', async () => {
    h.getContentMetadata.mockReset().mockResolvedValue(meta(1));
    h.readContent.mockReset();
    const out = await buildExplorerPreviewPayload('peA', 'deep/dir/report.pdf');
    expect(out.metadata.title).toBe('report.pdf');
    expect(out.metadata.file_name).toBe('report.pdf');
    expect(out.metadata.language).toBe('pdf');
  });

  // The size gate. Reading part of an oversized file and letting it reach a
  // saveable editor is what previously destroyed the unread remainder.
  it('oversized text: reads no content and marks the tab read-only', async () => {
    h.getContentMetadata.mockReset().mockResolvedValue(meta(TEXT_CEILING + 1));
    h.readContent.mockReset();
    const out = await buildExplorerPreviewPayload('peA', 'logs/huge.log');

    expect(h.readContent).not.toHaveBeenCalled();
    expect(out.content).toBe('');
    expect(out.metadata.oversized).toBe(true);
    expect(out.metadata.sizeBytes).toBe(TEXT_CEILING + 1);
    expect(out.metadata.thresholdBytes).toBe(TEXT_CEILING);
    expect(out.metadata.editable).toBe(false);
  });

  it('text at exactly the ceiling is not oversized (boundary is >, not >=)', async () => {
    h.getContentMetadata.mockReset().mockResolvedValue(meta(TEXT_CEILING));
    h.readContent.mockReset().mockResolvedValue('x');
    const out = await buildExplorerPreviewPayload('peA', 'logs/exact.log');

    expect(h.readContent).toHaveBeenCalled();
    expect(out.metadata.oversized).toBe(false);
  });

  // Images get a much higher ceiling: 1MB is small for a photo, while a data URL
  // still loads the whole file into memory, so some ceiling is still needed.
  it('image uses the 20MB ceiling, not the 1MB text one', async () => {
    h.getContentMetadata.mockReset().mockResolvedValue(meta(5 * 1024 * 1024));
    h.readContent.mockReset().mockResolvedValue('data:image/png;base64,QQ==');
    const out = await buildExplorerPreviewPayload('peA', 'pics/photo.png');

    expect(h.readContent).toHaveBeenCalled(); // a 5MB image is fine
    expect(out.metadata.oversized).toBe(false);
    expect(out.metadata.thresholdBytes).toBe(IMAGE_CEILING);
  });

  it('oversized image: reads no content', async () => {
    h.getContentMetadata.mockReset().mockResolvedValue(meta(IMAGE_CEILING + 1));
    h.readContent.mockReset();
    const out = await buildExplorerPreviewPayload('peA', 'pics/huge.png');

    expect(h.readContent).not.toHaveBeenCalled();
    expect(out.metadata.oversized).toBe(true);
  });

  // The mtime rides along so the tab's first save carries an If-Match; without it
  // the backend skips conflict detection and silently overwrites.
  it('carries lastModified from the same metadata call that decided the size', async () => {
    h.getContentMetadata.mockReset().mockResolvedValue(meta(12, 1_777_000_000_123));
    h.readContent.mockReset().mockResolvedValue('body');
    const out = await buildExplorerPreviewPayload('peA', 'notes/a.txt');

    expect(out.metadata.lastModified).toBe(1_777_000_000_123);
    expect(h.getContentMetadata).toHaveBeenCalledTimes(1); // one round trip, not two
  });
});
