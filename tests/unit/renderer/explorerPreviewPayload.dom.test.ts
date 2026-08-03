/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Coverage for the Explorer file-open payload builder: text + image now carry a
// Project ChatFileRef and read their content over /api/fs/content (utf8/dataurl).
// PATCH(ELECTRON-3SZ): pdf/office still resolve an absolute path via WS fs/resolve
// (removed in PR-3).

import { describe, expect, it, vi } from 'vitest';

// Record ipcBridge.fs.readContent calls + script its return per test.
const h = vi.hoisted(() => ({ readContent: vi.fn() }));

// Isolate the container module from React/UI + WS/IPC side effects; the builder
// under test is a pure async fn that only needs the injected RPC client + fs.readContent.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/renderer/pages/conversation/Preview', () => ({ usePreviewContext: () => ({ openPreview: () => {} }) }));
vi.mock('@/common', () => ({
  ipcBridge: { project: { get: { invoke: () => Promise.resolve() } }, fs: { readContent: { invoke: h.readContent } } },
}));
vi.mock('@/renderer/pages/conversation/explorer/monitorTransport', () => ({ initExplorerRuntime: () => ({}) }));

import { buildExplorerPreviewPayload } from '@/renderer/pages/conversation/explorer/ExplorerContainer';

type Call = { method: string; params: unknown };

/** Fake WS-RPC client recording calls and returning a scripted result. */
const fakeClient = (result: unknown) => {
  const calls: Call[] = [];
  return {
    calls,
    request: (method: string, params?: unknown) => {
      calls.push({ method, params });
      return Promise.resolve(result);
    },
  };
};

describe('buildExplorerPreviewPayload', () => {
  it('image: reads dataurl content over /content, carries a Project ref, no file_path', async () => {
    h.readContent.mockReset().mockResolvedValue('data:image/png;base64,QUJD');
    const client = fakeClient(null);
    const out = await buildExplorerPreviewPayload(client, 'peA', 'pics/logo.png');

    // Content read by ChatFileRef identity (backend prepends the data-URL prefix).
    expect(h.readContent).toHaveBeenCalledWith({
      file: { kind: 'project', pe_id: 'peA', relative_path: 'pics/logo.png' },
      encoding: 'dataurl',
    });
    expect(client.calls).toEqual([]); // no WS resolve for images
    expect(out.contentType).toBe('image');
    expect(out.content).toBe('data:image/png;base64,QUJD');
    expect(out.metadata.fileRef).toEqual({ kind: 'project', pe_id: 'peA', relative_path: 'pics/logo.png' });
    expect(out.metadata.file_path).toBeUndefined();
    expect(out.metadata.workspace).toBeUndefined();
    expect(out.metadata.editable).toBe(false);
  });

  it('image: empty content stays empty (backend decides encoding/prefix)', async () => {
    h.readContent.mockReset().mockResolvedValue('');
    const out = await buildExplorerPreviewPayload(fakeClient(null), 'peA', 'x.png');
    expect(out.content).toBe('');
  });

  it('pdf: no content read and no fs/resolve — renders via stream URL from the Project ref', async () => {
    h.readContent.mockReset();
    const client = fakeClient(null);
    const out = await buildExplorerPreviewPayload(client, 'peA', 'reports/q2.pdf');

    expect(client.calls).toEqual([]); // pdf no longer resolves an absolute path
    expect(h.readContent).not.toHaveBeenCalled();
    expect(out.content).toBe('');
    expect(out.metadata.fileRef).toEqual({ kind: 'project', pe_id: 'peA', relative_path: 'reports/q2.pdf' });
    expect(out.metadata.file_path).toBeUndefined(); // "open in system" hidden without a path
  });

  it.each(['r.docx', 's.xlsx', 'd.pptx'])(
    'office resolves absolute path via fs/resolve but still carries a Project ref: %s',
    async (rel) => {
      h.readContent.mockReset();
      const client = fakeClient({ absolute_path: '/ws/proj/' + rel, workspace_root: '/ws/proj' });
      const out = await buildExplorerPreviewPayload(client, 'peA', rel);

      expect(client.calls).toEqual([{ method: 'fs/resolve', params: { file: { pe_id: 'peA', relative_path: rel } } }]);
      expect(h.readContent).not.toHaveBeenCalled(); // never reads content for these
      expect(out.content).toBe('');
      expect(out.metadata.fileRef).toEqual({ kind: 'project', pe_id: 'peA', relative_path: rel });
      expect(out.metadata.file_path).toBe('/ws/proj/' + rel);
      expect(out.metadata.workspace).toBe('/ws/proj');
    }
  );

  it('text: reads utf8 content over /content, no absolute-path resolve', async () => {
    h.readContent.mockReset().mockResolvedValue('# hello');
    const client = fakeClient(null);
    const out = await buildExplorerPreviewPayload(client, 'peA', 'notes/readme.md');

    expect(h.readContent).toHaveBeenCalledWith({
      file: { kind: 'project', pe_id: 'peA', relative_path: 'notes/readme.md' },
      encoding: 'utf8',
    });
    expect(client.calls).toEqual([]);
    expect(out.contentType).toBe('markdown');
    expect(out.content).toBe('# hello');
    expect(out.metadata.fileRef).toEqual({ kind: 'project', pe_id: 'peA', relative_path: 'notes/readme.md' });
    expect(out.metadata.file_path).toBeUndefined();
    expect(out.metadata.editable).toBe(false); // markdown is non-editable in preview
  });

  it('code: reads utf8 and stays editable (editable undefined)', async () => {
    h.readContent.mockReset().mockResolvedValue('x=1');
    const out = await buildExplorerPreviewPayload(fakeClient(null), 'peA', 'main.py');
    expect(out.contentType).toBe('code');
    expect(out.content).toBe('x=1');
    expect(out.metadata.editable).toBeUndefined();
  });

  it('uses the file basename for title/file_name/language', async () => {
    h.readContent.mockReset();
    const out = await buildExplorerPreviewPayload(
      fakeClient({ absolute_path: '/ws/deep/dir/report.pdf', workspace_root: '/ws' }),
      'peA',
      'deep/dir/report.pdf'
    );
    expect(out.metadata.title).toBe('report.pdf');
    expect(out.metadata.file_name).toBe('report.pdf');
    expect(out.metadata.language).toBe('pdf');
  });
});
