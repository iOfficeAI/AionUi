/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Coverage for the Explorer file-open payload builder. Every explorer file maps
// to a Project ChatFileRef: text/image read content over /api/fs/content
// (utf8/dataurl); pdf/office read no content and resolve no absolute path (pdf
// renders from the stream URL, office resolves the ref server-side). No WS
// fs/resolve, no file_path/workspace exposed.

import { describe, expect, it, vi } from 'vitest';

// Record ipcBridge.fs.readContent calls + script its return per test.
const h = vi.hoisted(() => ({ readContent: vi.fn() }));

// Isolate the container module from React/UI + WS/IPC side effects; the builder
// under test is a pure async fn that only needs fs.readContent.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/renderer/pages/conversation/Preview', () => ({ usePreviewContext: () => ({ openPreview: () => {} }) }));
vi.mock('@/common', () => ({
  ipcBridge: { project: { get: { invoke: () => Promise.resolve() } }, fs: { readContent: { invoke: h.readContent } } },
}));
vi.mock('@/renderer/pages/conversation/explorer/monitorTransport', () => ({ initExplorerRuntime: () => ({}) }));

import { buildExplorerPreviewPayload } from '@/renderer/pages/conversation/explorer/ExplorerContainer';

describe('buildExplorerPreviewPayload', () => {
  it('image: reads dataurl content over /content, carries a Project ref, no file_path', async () => {
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
  });

  it('image: empty content stays empty (backend decides encoding/prefix)', async () => {
    h.readContent.mockReset().mockResolvedValue('');
    const out = await buildExplorerPreviewPayload('peA', 'x.png');
    expect(out.content).toBe('');
  });

  it.each(['reports/q2.pdf', 'r.docx', 's.xlsx', 'd.pptx'])(
    'pdf/office: no content read and no fs/resolve — rendered from the Project ref: %s',
    async (rel) => {
      h.readContent.mockReset();
      const out = await buildExplorerPreviewPayload('peA', rel);

      expect(h.readContent).not.toHaveBeenCalled(); // never reads content for these
      expect(out.content).toBe('');
      expect(out.metadata.fileRef).toEqual({ kind: 'project', pe_id: 'peA', relative_path: rel });
    }
  );

  it('text: reads utf8 content over /content', async () => {
    h.readContent.mockReset().mockResolvedValue('# hello');
    const out = await buildExplorerPreviewPayload('peA', 'notes/readme.md');

    expect(h.readContent).toHaveBeenCalledWith({
      file: { kind: 'project', pe_id: 'peA', relative_path: 'notes/readme.md' },
      encoding: 'utf8',
    });
    expect(out.contentType).toBe('markdown');
    expect(out.content).toBe('# hello');
    expect(out.metadata.fileRef).toEqual({ kind: 'project', pe_id: 'peA', relative_path: 'notes/readme.md' });
    expect(out.metadata.editable).toBe(false); // markdown is non-editable in preview
  });

  it('code: reads utf8 and stays editable (editable undefined)', async () => {
    h.readContent.mockReset().mockResolvedValue('x=1');
    const out = await buildExplorerPreviewPayload('peA', 'main.py');
    expect(out.contentType).toBe('code');
    expect(out.content).toBe('x=1');
    expect(out.metadata.editable).toBeUndefined();
  });

  it('uses the file basename for title/file_name/language', async () => {
    h.readContent.mockReset();
    const out = await buildExplorerPreviewPayload('peA', 'deep/dir/report.pdf');
    expect(out.metadata.title).toBe('report.pdf');
    expect(out.metadata.file_name).toBe('report.pdf');
    expect(out.metadata.language).toBe('pdf');
  });
});
