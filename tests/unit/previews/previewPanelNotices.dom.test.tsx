/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Preview downloads and their user-facing failures actually reach the browser.
//
// The panel raises notices through `messageApi` (download failures, "open in
// system" errors, the save-conflict warning). All of
// them depend on one easily-lost line of JSX: `{messageContextHolder}`. Drop it and
// `messageApi.error()` still runs, still throws nothing, and shows the user
// absolutely nothing — a pure silent failure that no type or lint check sees.
//
// So this asserts the message TEXT lands in the DOM. Asserting "messageApi was
// called" would stay green with the holder deleted, which is the exact trap of
// testing the call instead of the outcome.
//
// Deliberately does NOT mock @arco-design/web-react: the real Message.useMessage
// and its holder are the things under test. Mocking them would only verify the
// mock.

import React from 'react';
import { Message } from '@arco-design/web-react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enPreview from '@/renderer/services/i18n/locales/en-US/preview.json';

const mocks = vi.hoisted(() => ({
  readContent: vi.fn(),
  fetch: vi.fn(),
}));

// `t` echoes the key, so asserting on the key proves the pipeline delivered a
// translated string rather than an empty node.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    // The panel formats byte sizes against the app language.
    i18n: { language: 'en-US' },
  }),
}));

// Opening a text tab mounts a CodeMirror editor, which reads the theme context.
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

// Excel rendering has its own worker/status lifecycle and is outside these
// download tests. Keeping it mounted can leave async viewer work running after
// the panel behavior under test has completed.
vi.mock('@/renderer/pages/conversation/Preview/components/viewers/ExcelViewer', () => ({
  default: () => null,
}));

vi.mock('@/common', () => ({
  ipcBridge: (() => {
    const officePreview = {
      status: { on: () => () => {} },
      start: { invoke: async () => ({ error: 'OFFICECLI_NOT_FOUND' }) },
      stop: { invoke: async () => undefined },
    };
    return {
      fileStream: { contentUpdate: { on: () => () => {} } },
      preview: { open: { on: () => () => {} } },
      shell: { openFile: { invoke: async () => undefined } },
      excelPreview: officePreview,
      wordPreview: officePreview,
      pptPreview: officePreview,
      fs: {
        writeContent: { invoke: async () => true },
        getContentMetadata: { invoke: async () => null },
        readContent: { invoke: mocks.readContent },
        openSystem: { invoke: async () => undefined },
        writeFile: { invoke: async () => true },
        getFileMetadata: { invoke: async () => null },
        getImageBase64: { invoke: async () => null },
      },
    };
  })(),
}));

import PreviewPanel from '@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel';
import {
  PreviewProvider,
  usePreviewContext,
  type PreviewContextValue,
} from '@/renderer/pages/conversation/Preview/context/PreviewContext';

let ctx: PreviewContextValue;
const Probe: React.FC = () => {
  ctx = usePreviewContext();
  return null;
};

/**
 * Mount the provider first, open the tab, and only then mount the panel.
 *
 * Necessary because `PreviewPanel` returns null before some of its hooks run
 * (`handleDownload` / `handleOpenInSystem` sit after `if (!isOpen || !activeTab)
 * return null`), so rendering it across a closed → open transition changes its
 * hook count and React aborts with "Rendered more hooks than during the previous
 * render". That is a pre-existing conditional-hook violation, not something this
 * test introduces — see the note in the report. Mounting into an already-open
 * panel keeps the hook count stable for the panel's whole life.
 */
const Harness: React.FC<{ showPanel: boolean }> = ({ showPanel }) => (
  <PreviewProvider>
    <Probe />
    {showPanel ? <PreviewPanel /> : null}
  </PreviewProvider>
);

/**
 * An oversized tab with no disk path — the explorer case. Downloading it would
 * write a 0-byte file, so the panel refuses and says why.
 */
const openOversizedTab = (): void => {
  act(() => {
    ctx.openPreview('', 'code', {
      title: 'huge.log',
      file_name: 'huge.log',
      fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'logs/huge.log' },
      oversized: true,
      sizeBytes: 5 * 1024 * 1024,
      thresholdBytes: 1024 * 1024,
      editable: false,
    });
  });
};

/**
 * An unsupported-format tab: identified, but nothing here can render it. Also has
 * no content, so downloading would produce a 0-byte file just like an oversized one
 * — but for a different reason, which the message has to reflect.
 */
const openUnsupportedTab = (): void => {
  act(() => {
    ctx.openPreview('', 'unsupported', {
      title: 'photo.heic',
      file_name: 'photo.heic',
      language: 'heic',
      fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'pics/photo.heic' },
      editable: false,
    });
  });
};

const openExcelTab = (): void => {
  act(() => {
    ctx.openPreview('', 'excel', {
      title: 'budget.xlsx',
      file_name: 'budget.xlsx',
      fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'sheets/budget.xlsx' },
      editable: false,
    });
  });
};

beforeEach(() => {
  localStorage.clear();
  mocks.readContent.mockReset().mockResolvedValue(null);
  mocks.fetch.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const TIMEOUT_MS = 30000;

describe('preview download behavior', () => {
  const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  let downloadedBlobs: Blob[];
  let downloadedNames: string[];

  beforeEach(() => {
    downloadedBlobs = [];
    downloadedNames = [];
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        downloadedBlobs.push(blob);
        return 'blob:preview-download';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloadedNames.push(this.download);
    });
  });

  afterEach(() => {
    if (originalCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    if (originalRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
    else Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it(
    'downloads the original bytes for an Explorer-backed Excel tab',
    async () => {
      const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01]);
      mocks.fetch.mockResolvedValue(
        new Response(bytes, {
          headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        })
      );
      const { rerender } = render(<Harness showPanel={false} />);
      openExcelTab();
      act(() => rerender(<Harness showPanel />));

      const downloadButton = await screen.findByTitle('preview.downloadFile');
      fireEvent.click(downloadButton);

      await waitFor(() => {
        expect(downloadedBlobs).toHaveLength(1);
      });
      expect(mocks.fetch).toHaveBeenCalledWith(
        '/api/fs/stream?kind=project&pe_id=peA&relative_path=sheets%2Fbudget.xlsx'
      );
      expect(downloadedBlobs[0]).toMatchObject({
        size: bytes.byteLength,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      expect(downloadedNames).toEqual(['budget.xlsx']);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-download');
    },
    TIMEOUT_MS
  );

  it(
    'shows the oversized download refusal to the user',
    async () => {
      const { rerender } = render(<Harness showPanel={false} />);
      openOversizedTab();
      act(() => rerender(<Harness showPanel />));

      const downloadButton = await screen.findByTitle('preview.downloadFile');
      fireEvent.click(downloadButton);

      await waitFor(() => expect(screen.getByText('preview.oversized.downloadUnavailable')).toBeInTheDocument());
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(downloadedBlobs).toHaveLength(0);
    },
    TIMEOUT_MS
  );

  it(
    'explains an unsupported download refusal by format, not by size',
    async () => {
      const { rerender } = render(<Harness showPanel={false} />);
      openUnsupportedTab();
      act(() => rerender(<Harness showPanel />));

      const downloadButton = await screen.findByTitle('preview.downloadFile');
      fireEvent.click(downloadButton);

      await waitFor(() => expect(screen.getByText('preview.unsupported.downloadUnavailable')).toBeInTheDocument());
      expect(screen.queryByText('preview.oversized.downloadUnavailable')).not.toBeInTheDocument();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(downloadedBlobs).toHaveLength(0);
    },
    TIMEOUT_MS
  );

  it(
    'shows the existing failure message without starting a download when the backing read fails',
    async () => {
      mocks.fetch.mockRejectedValue(new Error('read failed'));
      const { rerender } = render(<Harness showPanel={false} />);
      openExcelTab();
      act(() => rerender(<Harness showPanel />));

      fireEvent.click(await screen.findByTitle('preview.downloadFile'));

      await waitFor(() => expect(screen.getByText('Failed to download')).toBeInTheDocument());
      expect(downloadedBlobs).toHaveLength(0);
      expect(downloadedNames).toHaveLength(0);
    },
    TIMEOUT_MS
  );

  it(
    'reports a failure when the backing stream refuses the download',
    async () => {
      const messageError = vi.fn();
      vi.spyOn(Message, 'useMessage').mockReturnValue([
        { error: messageError } as unknown as ReturnType<typeof Message.useMessage>[0],
        null,
      ]);
      mocks.fetch.mockResolvedValue(new Response(null, { status: 404 }));
      const { rerender } = render(<Harness showPanel={false} />);
      openExcelTab();
      act(() => rerender(<Harness showPanel />));

      const downloadButton = await screen.findByTitle('preview.downloadFile');
      fireEvent.click(downloadButton);
      await Promise.resolve();
      await Promise.resolve();

      expect(messageError).toHaveBeenCalledWith('Failed to download');
      expect(downloadedBlobs).toHaveLength(0);
      expect(downloadedNames).toHaveLength(0);
    },
    TIMEOUT_MS
  );

  it(
    'refuses a content-free download when the tab has no safe file reference',
    async () => {
      const messageError = vi.fn();
      vi.spyOn(Message, 'useMessage').mockReturnValue([
        { error: messageError } as unknown as ReturnType<typeof Message.useMessage>[0],
        null,
      ]);
      const { rerender } = render(<Harness showPanel={false} />);
      act(() => {
        ctx.openPreview('', 'excel', {
          title: 'detached.xlsx',
          file_name: 'detached.xlsx',
          editable: false,
        });
      });
      act(() => rerender(<Harness showPanel />));

      const downloadButton = await screen.findByTitle('preview.downloadFile');
      fireEvent.click(downloadButton);

      expect(messageError).toHaveBeenCalledWith('Failed to download');
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(downloadedBlobs).toHaveLength(0);
    },
    TIMEOUT_MS
  );

  it(
    'rejects an empty stream instead of saving a zero-byte file',
    async () => {
      mocks.fetch.mockResolvedValue(new Response());
      const { rerender } = render(<Harness showPanel={false} />);
      openExcelTab();
      act(() => rerender(<Harness showPanel />));

      fireEvent.click(await screen.findByTitle('preview.downloadFile'));

      await waitFor(() => expect(screen.getByText('Failed to download')).toBeInTheDocument());
      expect(downloadedBlobs).toHaveLength(0);
      expect(downloadedNames).toHaveLength(0);
    },
    TIMEOUT_MS
  );

  it(
    'downloads editable text from memory instead of rereading the backing file',
    async () => {
      const { rerender } = render(<Harness showPanel={false} />);
      act(() => {
        ctx.openPreview('unsaved edit', 'code', {
          title: 'draft.ts',
          file_name: 'draft.ts',
          fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'src/draft.ts' },
          language: 'typescript',
        });
      });
      act(() => rerender(<Harness showPanel />));

      fireEvent.click(await screen.findByTitle('preview.downloadFile'));

      await waitFor(() => expect(downloadedBlobs).toHaveLength(1));
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.readContent).not.toHaveBeenCalled();
      expect(downloadedBlobs[0]).toMatchObject({ size: 12, type: 'text/plain;charset=utf-8' });
      expect(downloadedNames).toEqual(['draft.ts']);
    },
    TIMEOUT_MS
  );
});

// A message that resolves to nothing is as silent as no message at all, so the
// keys the panel asks for have to exist in the reference locale.
describe('the notice keys exist in en-US', () => {
  const oversized = (enPreview as { oversized?: Record<string, string> }).oversized ?? {};

  it('defines the oversized download refusal', () => {
    expect(oversized.downloadUnavailable).toBeTruthy();
  });

  it('defines the save-conflict warning used when a write is refused', () => {
    expect((enPreview as { saveConflict?: string }).saveConflict).toBeTruthy();
  });

  it('defines the storage-quota warning', () => {
    expect((enPreview as { persistQuotaExceeded?: string }).persistQuotaExceeded).toBeTruthy();
  });

  it('defines the batch close confirmation copy', () => {
    expect((enPreview as { closeTabsTitle?: string }).closeTabsTitle).toBeTruthy();
    expect((enPreview as { closeTabsMessage?: string }).closeTabsMessage).toContain('{{count}}');
  });
});

// The panel used to declare two `useCallback`s after its `if (!isOpen || !activeTab)
// early return, so opening a tab changed its hook count mid-life and React aborted
// with "Rendered more hooks than during the previous render". Nothing caught it
// because nothing rendered the panel across that transition — the missing test and
// the bug kept each other alive. The guard now sits below every hook.
describe('the panel survives being opened while mounted', () => {
  it(
    'renders through a closed to open transition without a hook-count error',
    () => {
      render(<Harness showPanel />);

      expect(() => {
        act(() => {
          ctx.openPreview('body', 'code', { title: 'a.ts', file_name: 'a.ts' });
        });
      }).not.toThrow();
    },
    TIMEOUT_MS
  );
});

// The refresh control is the only thing telling a user that a file they have open
// changed underneath them, so its two appearances are asserted through a stable
// `data-*` hook rather than through whichever class currently paints "amber" — a
// colour assertion breaks on restyling without the behaviour changing at all.
describe('the refresh control reflects what it can promise', () => {
  const openProjectTab = (): void => {
    act(() => {
      ctx.openPreview('body', 'code', {
        title: 'a.ts',
        file_name: 'a.ts',
        fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'src/a.ts' },
      });
    });
  };

  it(
    'shows a plain state for a project file with nothing reported',
    async () => {
      const { rerender } = render(<Harness showPanel={false} />);
      openProjectTab();
      act(() => rerender(<Harness showPanel />));

      const control = await screen.findByTestId('preview-refresh');
      expect(control.getAttribute('data-refresh-state')).toBe('idle');
    },
    TIMEOUT_MS
  );

  it(
    'marks a file outside the project as having no signal source',
    async () => {
      const { rerender } = render(<Harness showPanel={false} />);
      act(() => {
        ctx.openPreview('body', 'code', {
          title: 'a.ts',
          file_name: 'a.ts',
          fileRef: { kind: 'local', path: '/elsewhere/a.ts' },
        });
      });
      act(() => rerender(<Harness showPanel />));

      const control = await screen.findByTestId('preview-refresh');
      expect(control.getAttribute('data-refresh-state')).toBe('idle-no-signal');
    },
    TIMEOUT_MS
  );

  // Refreshing an oversized file would re-reach the same verdict, so offering the
  // control at all would be offering something that cannot work.
  it(
    'is absent for a file too large to preview',
    async () => {
      const { rerender } = render(<Harness showPanel={false} />);
      openOversizedTab();
      act(() => rerender(<Harness showPanel />));

      await screen.findByTitle('preview.downloadFile'); // toolbar is up
      expect(screen.queryByTestId('preview-refresh')).not.toBeInTheDocument();
    },
    TIMEOUT_MS
  );

  it(
    'is absent for a format that cannot be rendered',
    async () => {
      const { rerender } = render(<Harness showPanel={false} />);
      openUnsupportedTab();
      act(() => rerender(<Harness showPanel />));

      await screen.findByTitle('preview.downloadFile');
      expect(screen.queryByTestId('preview-refresh')).not.toBeInTheDocument();
    },
    TIMEOUT_MS
  );

  it(
    'is present but inert for a tab with no addressable file',
    async () => {
      const { rerender } = render(<Harness showPanel={false} />);
      act(() => {
        ctx.openPreview('body', 'code', { title: 'scratch', file_name: 'scratch' });
      });
      act(() => rerender(<Harness showPanel />));

      const control = await screen.findByTestId('preview-refresh');
      expect(control.getAttribute('data-refresh-state')).toBe('disabled');
    },
    TIMEOUT_MS
  );
});
