/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// PATCH(ELECTRON-3SZ): focused coverage for the Explorer file-open payload
// builder — image data-URL wrapping + pdf/office absolute-path resolve + text
// passthrough. Remove with the patch once Preview consumes {pe_id,relative_path}.

import { describe, expect, it, vi } from 'vitest';

// Isolate the container module from React/UI + WS/IPC side effects; the builder
// under test is a pure async fn that only needs the injected RPC client.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/renderer/pages/conversation/Preview', () => ({ usePreviewContext: () => ({ openPreview: () => {} }) }));
vi.mock('@/common', () => ({ ipcBridge: { project: { get: { invoke: () => Promise.resolve() } } } }));
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

describe('buildExplorerPreviewPayload (PATCH ELECTRON-3SZ)', () => {
  it('image: reads base64 and wraps it into a data URL, no file_path', async () => {
    const client = fakeClient({ content: 'QUJD' });
    const out = await buildExplorerPreviewPayload(client, 'peA', 'pics/logo.png');

    expect(client.calls).toEqual([
      { method: 'fs/read', params: { file: { pe_id: 'peA', relative_path: 'pics/logo.png' }, encoding: 'base64' } },
    ]);
    expect(out.contentType).toBe('image');
    expect(out.content).toBe('data:image/png;base64,QUJD');
    expect(out.metadata.file_path).toBeUndefined();
    expect(out.metadata.workspace).toBeUndefined();
    expect(out.metadata.editable).toBe(false);
  });

  it('image: picks MIME by extension (svg → image/svg+xml)', async () => {
    const out = await buildExplorerPreviewPayload(fakeClient({ content: 'PHN2Zz4=' }), 'peA', 'a/b/icon.svg');
    expect(out.content).toBe('data:image/svg+xml;base64,PHN2Zz4=');
  });

  it('image: empty body yields empty content (no bogus data URL)', async () => {
    const out = await buildExplorerPreviewPayload(fakeClient({ content: '' }), 'peA', 'x.png');
    expect(out.content).toBe('');
  });

  it.each(['doc.pdf', 'r.docx', 's.xlsx', 'd.pptx'])(
    'pdf/office resolves absolute path via fs/resolve: %s',
    async (rel) => {
      const client = fakeClient({ absolute_path: '/ws/proj/' + rel, workspace_root: '/ws/proj' });
      const out = await buildExplorerPreviewPayload(client, 'peA', rel);

      expect(client.calls).toEqual([{ method: 'fs/resolve', params: { file: { pe_id: 'peA', relative_path: rel } } }]);
      expect(out.content).toBe(''); // never reads content for these
      expect(out.metadata.file_path).toBe('/ws/proj/' + rel);
      expect(out.metadata.workspace).toBe('/ws/proj');
    }
  );

  it('text: reads utf-8 content, no absolute-path resolve', async () => {
    const client = fakeClient({ content: '# hello' });
    const out = await buildExplorerPreviewPayload(client, 'peA', 'notes/readme.md');

    expect(client.calls).toEqual([
      { method: 'fs/read', params: { file: { pe_id: 'peA', relative_path: 'notes/readme.md' }, encoding: 'utf-8' } },
    ]);
    expect(out.contentType).toBe('markdown');
    expect(out.content).toBe('# hello');
    expect(out.metadata.file_path).toBeUndefined();
    expect(out.metadata.editable).toBe(false); // markdown is non-editable in preview
  });

  it('code: reads utf-8 and stays editable (editable undefined)', async () => {
    const out = await buildExplorerPreviewPayload(fakeClient({ content: 'x=1' }), 'peA', 'main.py');
    expect(out.contentType).toBe('code');
    expect(out.content).toBe('x=1');
    expect(out.metadata.editable).toBeUndefined();
  });

  it('uses the file basename for title/file_name/language', async () => {
    const out = await buildExplorerPreviewPayload(fakeClient({ content: '' }), 'peA', 'deep/dir/report.pdf');
    expect(out.metadata.title).toBe('report.pdf');
    expect(out.metadata.file_name).toBe('report.pdf');
    expect(out.metadata.language).toBe('pdf');
  });
});
