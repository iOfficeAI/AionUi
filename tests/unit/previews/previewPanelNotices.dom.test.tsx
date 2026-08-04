/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// The preview panel's user-facing messages actually reach the screen.
//
// The panel raises ~13 notices through `messageApi` (download failures, the
// oversized notice, "open in system" errors, the save-conflict warning). All of
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
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enPreview from '@/renderer/services/i18n/locales/en-US/preview.json';

// `t` echoes the key, so asserting on the key proves the pipeline delivered a
// translated string rather than an empty node.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

// Opening a text tab mounts a CodeMirror editor, which reads the theme context.
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fileStream: { contentUpdate: { on: () => () => {} } },
    preview: { open: { on: () => () => {} } },
    shell: { openFile: { invoke: async () => undefined } },
    fs: {
      writeContent: { invoke: async () => true },
      getContentMetadata: { invoke: async () => null },
      readContent: { invoke: async () => null },
      openSystem: { invoke: async () => undefined },
      writeFile: { invoke: async () => true },
      getFileMetadata: { invoke: async () => null },
      getImageBase64: { invoke: async () => null },
    },
  },
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

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const TIMEOUT_MS = 30000;

describe('preview panel notices reach the DOM', () => {
  it(
    'shows the oversized download refusal to the user, not just to the code',
    async () => {
      const { rerender } = render(<Harness showPanel={false} />);
      openOversizedTab();
      act(() => rerender(<Harness showPanel />));

      const downloadButton = await screen.findByTitle('preview.downloadFile');
      fireEvent.click(downloadButton);

      // The load-bearing assertion: the copy is on screen. This is what breaks if
      // the holder is ever dropped during a JSX refactor.
      await waitFor(() => {
        expect(screen.getByText('preview.oversized.downloadUnavailable')).toBeInTheDocument();
      });
    },
    TIMEOUT_MS
  );

  // Same refusal, different reason. Telling the user a 2 MB HEIC is "too large to
  // download" is simply false, so the two states must not share one sentence — and
  // nothing enforced that until this test.
  it(
    'explains an unsupported download refusal by format, not by size',
    async () => {
      const { rerender } = render(<Harness showPanel={false} />);
      openUnsupportedTab();
      act(() => rerender(<Harness showPanel />));

      const downloadButton = await screen.findByTitle('preview.downloadFile');
      fireEvent.click(downloadButton);

      await waitFor(() => {
        expect(screen.getByText('preview.unsupported.downloadUnavailable')).toBeInTheDocument();
      });
      // The size explanation must not appear for a format problem.
      expect(screen.queryByText('preview.oversized.downloadUnavailable')).not.toBeInTheDocument();
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
