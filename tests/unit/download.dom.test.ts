/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getImageBase64: {
        invoke: vi.fn(),
      },
    },
  },
}));

import { downloadFileFromPath, downloadTextContent } from '../../src/renderer/utils/file/download';
import { ipcBridge } from '@/common';

const mockGetImageBase64 = ipcBridge.fs.getImageBase64.invoke as ReturnType<typeof vi.fn>;

function setupDomMocks() {
  const mockLink = { href: '', download: '', click: vi.fn() };
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
  vi.spyOn(document.body, 'appendChild').mockReturnValue(mockLink as unknown as Node);
  vi.spyOn(document.body, 'removeChild').mockReturnValue(mockLink as unknown as Node);
  return mockLink;
}

describe('downloadFileFromPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads a zip file with correct MIME type', async () => {
    const mockLink = setupDomMocks();
    mockGetImageBase64.mockResolvedValue('data:application/octet-stream;base64,UEsDBA==');

    await downloadFileFromPath('/workspace/archive.zip', 'archive.zip');

    expect(mockGetImageBase64).toHaveBeenCalledWith({ path: '/workspace/archive.zip' });
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/zip');
    expect(mockLink.download).toBe('archive.zip');
    expect(mockLink.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('downloads an xlsx file with correct MIME type', async () => {
    setupDomMocks();
    mockGetImageBase64.mockResolvedValue('data:application/octet-stream;base64,');

    await downloadFileFromPath('/workspace/data.xlsx', 'data.xlsx');

    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('uses application/octet-stream for unknown file extensions', async () => {
    setupDomMocks();
    mockGetImageBase64.mockResolvedValue('data:application/octet-stream;base64,');

    await downloadFileFromPath('/workspace/file.xyz', 'file.xyz');

    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/octet-stream');
  });

  it('rejects when ipcBridge throws', async () => {
    setupDomMocks();
    mockGetImageBase64.mockRejectedValue(new Error('IPC error'));

    await expect(downloadFileFromPath('/workspace/file.zip', 'file.zip')).rejects.toThrow('IPC error');
  });
});

describe('downloadTextContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a blob with the given content and triggers download', () => {
    const mockLink = setupDomMocks();

    downloadTextContent('# Hello', 'readme.md', 'text/markdown;charset=utf-8');

    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/markdown;charset=utf-8');
    expect(mockLink.download).toBe('readme.md');
    expect(mockLink.click).toHaveBeenCalled();
  });

  it('revokes the object URL after download', () => {
    setupDomMocks();

    downloadTextContent('content', 'file.txt', 'text/plain;charset=utf-8');

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
