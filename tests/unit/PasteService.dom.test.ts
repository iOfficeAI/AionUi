import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileMetadata } from '@/renderer/services/FileService';

// Mock dependencies before importing PasteService
vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      createTempFile: { invoke: vi.fn() },
      writeFile: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/services/FileService', () => ({
  getFileExtension: (name: string) => {
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.slice(idx) : '';
  },
  uploadFileViaHttp: vi.fn(),
  MAX_UPLOAD_SIZE_MB: 100,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

const { ipcBridge } = await import('@/common');

function createMockClipboardEvent(files: File[]): ClipboardEvent {
  // jsdom doesn't support DataTransfer, so we create a minimal mock
  const fileList = Object.assign(files, { item: (i: number) => files[i] ?? null });
  const event = {
    type: 'paste',
    clipboardData: {
      getData: () => '',
      files: fileList,
    },
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
  return event;
}

function createImageFile(name: string, size = 100): File {
  const data = new Uint8Array(size);
  return new File([data], name, { type: 'image/png' });
}

describe('PasteService.handlePaste — filename deduplication', () => {
  let PasteService: typeof import('@/renderer/services/PasteService').PasteService;
  let tempFileCounter: number;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempFileCounter = 0;

    // Each createTempFile call returns a unique path based on the fileName argument
    vi.mocked(ipcBridge.fs.createTempFile.invoke).mockImplementation(async ({ fileName }) => {
      tempFileCounter++;
      return `/tmp/temp-${tempFileCounter}/${fileName}`;
    });
    vi.mocked(ipcBridge.fs.writeFile.invoke).mockResolvedValue(undefined as never);

    // Re-import to get a fresh singleton
    const mod = await import('@/renderer/services/PasteService');
    PasteService = mod.PasteService;
  });

  it('assigns unique filenames when pasting multiple images with the same generated name', async () => {
    // Two system-generated screenshots pasted at the same time
    // Names matching /^[a-zA-Z]?_?\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/ are detected as system-generated
    const file1 = createImageFile('a_2026-03-30_14-30-25.png');
    const file2 = createImageFile('b_2026-03-30_14-30-25.png');

    const event = createMockClipboardEvent([file1, file2]);
    const addedFiles: FileMetadata[] = [];

    await PasteService.handlePaste(event, [], (files) => {
      addedFiles.push(...files);
    });

    expect(addedFiles).toHaveLength(2);
    // The two files must have different names
    expect(addedFiles[0].name).not.toBe(addedFiles[1].name);
    // Second file should have _2 suffix
    expect(addedFiles[1].name).toMatch(/_2\.png$/);
  });

  it('keeps original names when they are already unique', async () => {
    const file1 = createImageFile('photo_a.png');
    const file2 = createImageFile('photo_b.png');

    const event = createMockClipboardEvent([file1, file2]);
    const addedFiles: FileMetadata[] = [];

    await PasteService.handlePaste(event, [], (files) => {
      addedFiles.push(...files);
    });

    expect(addedFiles).toHaveLength(2);
    expect(addedFiles[0].name).toBe('photo_a.png');
    expect(addedFiles[1].name).toBe('photo_b.png');
  });

  it('handles three images with the same name', async () => {
    const file1 = createImageFile('a_2026-03-30_14-30-25.png');
    const file2 = createImageFile('b_2026-03-30_14-30-25.png');
    const file3 = createImageFile('c_2026-03-30_14-30-25.png');

    const event = createMockClipboardEvent([file1, file2, file3]);
    const addedFiles: FileMetadata[] = [];

    await PasteService.handlePaste(event, [], (files) => {
      addedFiles.push(...files);
    });

    expect(addedFiles).toHaveLength(3);
    const names = addedFiles.map((f) => f.name);
    // All names must be unique
    expect(new Set(names).size).toBe(3);
  });
});
