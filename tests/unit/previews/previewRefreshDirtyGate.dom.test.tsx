/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Clicking refresh with unsaved work must ask before reloading.
//
// Reloading overwrites `content` AND `originalContent` with what the disk holds
// (PreviewContext's reloadTabContent), so the edit is not merely hidden — the
// baseline it would be recovered from is gone too. One `if (activeTab?.isDirty)` in
// PreviewPanel stands between an unsaved edit and that, and until this file nothing
// clicked the button at all: the existing refresh tests assert the rendered
// `data-refresh-state` token, which is computed before any click happens.
//
// Both directions are asserted, because either half failing is a real defect:
//   - the confirmation appears, and
//   - no read reaches the filesystem.
// Asserting only the first stays green if someone adds a reload alongside the
// dialog. Asserting only the second is satisfied by a button that does nothing.
//
// The "did not read" assertion is paired with a positive control (a clean tab DOES
// read). Without it, any mistake that stops the click from reaching the handler —
// wrong test id, inert button, unmounted panel — would produce the same green.

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

// The observable for "a reload happened": reloadTabContent's first act is to read
// the file. Spying at the IPC boundary rather than on the context method keeps the
// panel → context → IPC chain inside what is under test.
//
// `vi.hoisted` because the factory below is lifted above ordinary declarations.
const { readContent } = vi.hoisted(() => ({ readContent: vi.fn(async () => 'disk contents') }));

vi.mock('@/common', () => ({
  ipcBridge: {
    fileStream: { contentUpdate: { on: () => () => {} } },
    preview: { open: { on: () => () => {} } },
    shell: { openFile: { invoke: async () => undefined } },
    fs: {
      writeContent: { invoke: async () => true },
      getContentMetadata: { invoke: async () => null },
      readContent: { invoke: readContent },
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

// Mounted only once the tab is open: the panel returns null before some of its hooks
// run, so rendering it across the closed → open transition changes its hook count.
const Harness: React.FC<{ showPanel: boolean }> = ({ showPanel }) => (
  <PreviewProvider>
    <Probe />
    {showPanel ? <PreviewPanel /> : null}
  </PreviewProvider>
);

/** A project-backed text tab — the case where refresh is both visible and actionable. */
const openProjectTab = (): void => {
  act(() => {
    ctx.openPreview('original body', 'code', {
      title: 'a.ts',
      file_name: 'a.ts',
      fileRef: { kind: 'project', pe_id: 'peA', relative_path: 'src/a.ts' },
    });
  });
};

const TIMEOUT_MS = 30000;

// jsdom implements no layout, so `Range` has neither of these (verified: both are
// `undefined` on a fresh jsdom Range). CodeMirror measures text by asking a Range for
// its rects, from a timer it schedules on mount — which lands after this test's
// cleanup and throws where no assertion can catch it, failing the run with the tests
// themselves green. Zero rects is the honest answer for a document that was never
// laid out; the editor only uses them for scroll geometry, which nothing here asserts.
//
// Kept local rather than added to the shared dom setup: that would silently change
// what every other CodeMirror test sees.
beforeEach(() => {
  const range = Range.prototype as unknown as {
    getClientRects?: () => DOMRectList;
    getBoundingClientRect?: () => DOMRect;
  };
  range.getClientRects ??= () =>
    ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  range.getBoundingClientRect ??= () => new DOMRect(0, 0, 0, 0);
});

beforeEach(() => {
  localStorage.clear();
  readContent.mockClear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('refreshing a tab with unsaved changes', () => {
  it(
    'asks before discarding the edit, and reads nothing until answered',
    async () => {
      const { rerender } = render(<Harness showPanel={false} />);
      openProjectTab();
      act(() => rerender(<Harness showPanel />));

      // Typing into the tab is what marks it dirty; setting a flag directly would
      // test a state shape rather than the situation the guard exists for.
      act(() => ctx.updateContent('edited but not saved'));
      await waitFor(() => expect(ctx.activeTab?.isDirty).toBe(true));

      fireEvent.click(await screen.findByTestId('preview-refresh'));

      // Direction 1: the user is asked.
      await waitFor(() => {
        expect(screen.getByText('preview.refresh.confirmTitle')).toBeInTheDocument();
      });
      // Direction 2: and nothing was reloaded behind the dialog.
      expect(readContent).not.toHaveBeenCalled();
      expect(ctx.activeTab?.content).toBe('edited but not saved');
    },
    TIMEOUT_MS
  );

  it(
    'declining the dialog leaves the edit alone',
    async () => {
      // The dialog now offers exactly two ways out, and only one of them may reload.
      // Asserting the dialog appears is not enough: a "cancel" wired to the discard
      // handler would still show it and then destroy the edit anyway — which is the
      // one thing this whole confirmation exists to prevent.
      const { rerender } = render(<Harness showPanel={false} />);
      openProjectTab();
      act(() => rerender(<Harness showPanel />));

      act(() => ctx.updateContent('edited but not saved'));
      await waitFor(() => expect(ctx.activeTab?.isDirty).toBe(true));

      fireEvent.click(await screen.findByTestId('preview-refresh'));
      await waitFor(() => {
        expect(screen.getByText('preview.refresh.confirmTitle')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('common.cancel'));

      // Nothing was read: the edit stands untouched. (The dialog element itself
      // lingers in the DOM after Arco hides it, so asserting on its absence would
      // test the modal library rather than this guard — the load-bearing fact is
      // that no reload happened.)
      expect(readContent).not.toHaveBeenCalled();
      expect(ctx.activeTab?.content).toBe('edited but not saved');
      expect(ctx.activeTab?.isDirty).toBe(true);
    },
    TIMEOUT_MS
  );

  // The positive control for the assertion above. If a click could not reach the
  // handler at all, this fails while the dirty case would still look correct.
  it(
    'reloads immediately when there is nothing to lose',
    async () => {
      const { rerender } = render(<Harness showPanel={false} />);
      openProjectTab();
      act(() => rerender(<Harness showPanel />));

      fireEvent.click(await screen.findByTestId('preview-refresh'));

      await waitFor(() => expect(readContent).toHaveBeenCalled());
      // No dialog: there was no unsaved work to ask about.
      expect(screen.queryByText('preview.refresh.confirmTitle')).not.toBeInTheDocument();
    },
    TIMEOUT_MS
  );

  // "Discard my changes" is the one path allowed to overwrite the edit, and it must
  // actually go through — a dialog whose discard button did nothing would leave the
  // user unable to refresh at all, with the guard above looking perfectly fine.
  it(
    'reloads once the user chooses to discard',
    async () => {
      const { rerender } = render(<Harness showPanel={false} />);
      openProjectTab();
      act(() => rerender(<Harness showPanel />));

      act(() => ctx.updateContent('edited but not saved'));
      await waitFor(() => expect(ctx.activeTab?.isDirty).toBe(true));
      fireEvent.click(await screen.findByTestId('preview-refresh'));

      fireEvent.click(await screen.findByText('preview.refresh.discardAndRefresh'));

      await waitFor(() => expect(readContent).toHaveBeenCalled());
      // The reloaded tab is clean: its content now *is* the file's.
      await waitFor(() => {
        expect(ctx.activeTab?.content).toBe('disk contents');
        expect(ctx.activeTab?.isDirty).toBe(false);
      });
    },
    TIMEOUT_MS
  );
});
