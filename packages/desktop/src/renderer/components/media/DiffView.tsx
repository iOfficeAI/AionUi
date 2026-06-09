/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared diff renderer powered by @pierre/diffs.
 *
 * Replaces the previous diff2html-based component pair (Diff2Html.tsx +
 * DiffViewer.tsx). Features:
 * - Stacked vs side-by-side toggle (`diffStyle: 'unified' | 'split'`).
 * - Lazy / virtualized rendering (built into Pierre's `PatchDiff`).
 * - Click a line to jump to it in the in-app Monaco editor
 *   (`ipcBridge.shell.openFile({ file_path, line_number })`).
 * - Custom Chisl theme (parchment + rust + olive ink) registered once per
 *   session via `registerCustomTheme`; light/dark driven by `themeType`.
 *
 * The patch input is the same unified-diff string previously fed to
 * `diff2html`'s `html()` helper. We hand it to Pierre's `PatchDiff`
 * component, which parses and renders in one step.
 */

import {
  type FileDiffMetadata,
  type OnDiffLineClickProps,
  type ThemesType,
  parsePatchFiles,
  registerCustomTheme,
} from '@pierre/diffs';
import { PatchDiff, WorkerPoolContextProvider } from '@pierre/diffs/react';
import { Checkbox } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHISL_THEME_LOADERS, CHISL_THEMES } from './chislTheme';
import { ipcBridge } from '@/common';
import { requestEditorRevealLine } from '@/renderer/pages/conversation/Editor/editorReveal';
import styles from './DiffView.module.css';

// ---------------------------------------------------------------------------
// Theme registration (idempotent, runs once per process)
// ---------------------------------------------------------------------------

/**
 * `registerCustomTheme` is a process-level registration; calling it twice
 * with the same name throws. We guard with a module-local Set so HMR + React
 * 19 strict mode double-invoke don't crash the renderer.
 */
const REGISTERED_THEMES = new Set<string>(Object.keys(CHISL_THEME_LOADERS));
const ensureChislThemesRegistered = (): void => {
  for (const [name, loader] of Object.entries(CHISL_THEME_LOADERS)) {
    if (REGISTERED_THEMES.has(name)) continue;
    try {
      registerCustomTheme(name, async () => loader());
      REGISTERED_THEMES.add(name);
    } catch (error) {
      // Swallow "already registered" errors; surface anything else so we
      // can spot theme-shape mismatches early.
      if (error instanceof Error && /already.*registered/i.test(error.message)) {
        REGISTERED_THEMES.add(name);
      } else {
        // eslint-disable-next-line no-console
        console.error('[DiffView] Failed to register Chisl theme', name, error);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------

/**
 * `WorkerPoolContextProvider` is required by `PatchDiff` so syntax
 * highlighting happens off the main thread. The renderer is already
 * configured with `worker: { format: 'es' }` in `electron.vite.config.ts`,
 * so the `new Worker(new URL(..., import.meta.url), { type: 'module' })`
 * pattern resolves correctly through Vite's worker analysis.
 */
const createWorker = (): Worker =>
  new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), { type: 'module' });

// ---------------------------------------------------------------------------
// Diff pre-parse — used purely to discover the file path when the caller
// didn't supply one. PatchDiff re-parses internally; we just want the
// filename for the line-jump IPC call.
// ---------------------------------------------------------------------------

const extractFirstFileName = (patch: string): string | null => {
  if (!patch) return null;
  try {
    // `ParsedPatch` is a per-commit envelope; flatten files across all commits
    // so multi-commit patches still resolve a useful target on the first click.
    const parsed = parsePatchFiles(patch) as Array<{ files: FileDiffMetadata[] }>;
    const first: FileDiffMetadata | undefined = parsed
      .flatMap((p: { files: FileDiffMetadata[] }) => p.files)
      .find((f: FileDiffMetadata): f is FileDiffMetadata => Boolean(f));
    if (!first) return null;
    return first.prevName ?? first.name;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Theme mode resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the active Chisl color scheme from the same `data-theme` attribute
 * the rest of the app reads. Falls back to `light` during SSR / tests.
 */
const useChislThemeType = (): 'light' | 'dark' => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'light';
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      const next = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setTheme(next);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
};

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export type DiffViewProps = {
  /** Unified-diff / patch text. */
  diff: string;
  /** Absolute or workspace-relative path of the file the diff describes.
   *  Used to resolve `ipcBridge.shell.openFile` jumps. Falls back to the
   *  filename parsed out of the patch header when omitted. */
  file_path?: string;
  /** Optional CSS class for the root container. */
  className?: string;
  /** Initial stacked vs side-by-side mode. Defaults to stacked. */
  initialSplit?: boolean;
  /** Called when the user toggles between stacked and side-by-side. */
  onSplitChange?: (split: boolean) => void;
  /** When true, hide the toolbar entirely (the parent provides its own). */
  hideToolbar?: boolean;
};

const DiffView: React.FC<DiffViewProps> = ({
  diff,
  file_path,
  className,
  initialSplit = false,
  onSplitChange,
  hideToolbar = false,
}) => {
  // Theme + custom registration must happen before any `<PatchDiff>` mount.
  useEffect(() => {
    ensureChislThemesRegistered();
  }, []);

  const themeType = useChislThemeType();
  const [split, setSplit] = useState<boolean>(initialSplit);

  // Keep the local toggle in sync if the parent forces an initial value.
  const lastInitialRef = useRef(initialSplit);
  useEffect(() => {
    if (lastInitialRef.current !== initialSplit) {
      lastInitialRef.current = initialSplit;
      setSplit(initialSplit);
    }
  }, [initialSplit]);

  const handleSplitChange = useCallback(
    (next: boolean) => {
      setSplit(next);
      onSplitChange?.(next);
    },
    [onSplitChange]
  );

  // File path used for line jumps. Prefer the explicit prop, fall back to
  // the first parsed filename.
  const resolvedFilePath = useMemo<string | null>(() => {
    if (file_path && file_path.trim()) return file_path.trim();
    return extractFirstFileName(diff);
  }, [file_path, diff]);

  const handleLineClick = useCallback(
    (props: OnDiffLineClickProps) => {
      if (!resolvedFilePath) return;
      // For deletion-side clicks, Pierre reports the deletion line number;
      // for addition/context, the new-file line. Both are valid Monaco
      // targets — the user just wants to land on the relevant line.
      const lineNumber = props.lineNumber;
      // Stop the click from selecting / double-clicking into text; we just
      // want the navigation side effect.
      props.event.preventDefault();
      props.event.stopPropagation();
      // Tell the in-app editor to open the file (if not already) and jump.
      requestEditorRevealLine({ line: lineNumber });
      // Fire-and-forget the IPC so the OS-default-app path still gets a
      // chance to handle binary / unrendered files.
      void ipcBridge.shell.openFile
        .invoke({ file_path: resolvedFilePath, line_number: lineNumber })
        .catch((error: unknown) => {
          // The OS-default-app path may legitimately fail (e.g. clicking
          // a line in a non-text file preview); the in-app reveal above
          // still runs, so the click is never a no-op.
          // eslint-disable-next-line no-console
          console.debug('[DiffView] openFile rejected:', error);
        });
    },
    [resolvedFilePath]
  );

  const themeProp = useMemo<ThemesType>(() => ({ light: CHISL_THEMES.light, dark: CHISL_THEMES.dark }), []);

  /**
   * Override the Flexoki default styling with Chisl tokens. The Chisl
   * `ThemeRegistration` already covers editor chrome (gutter colors, line
   * number foreground, selection, etc.). `unsafeCSS` lets us nudge anything
   * the theme JSON doesn't reach — namely the inline line backgrounds that
   * Pierre uses for add/remove highlights.
   *
   * Pierre scopes its rendered DOM inside a shadow root, so these selectors
   * target the inner `pre` element with `:where()` to keep specificity low
   * and avoid clashing with future Pierre internals.
   */
  const unsafeCSS = useMemo(
    () => `
/* Chisl diff background + text — fall back to CSS variables defined in
 * chisl-color-scheme.css. The custom theme JSON already maps the primary
 * editor tokens; these rules cover the inline diff-row backgrounds. */
:where(pre) {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

/* Insertion / deletion rows — fade the Chisl success/olive and danger/rust
 * to 18% alpha so the highlight reads as printed-ink, not neon. The exact
 * selector names are stable across Pierre 1.x; the unsafe layer is the
 * documented escape hatch for cosmetic tuning. */
@layer unsafe {
  [data-diffs-line-type='addition'] {
    background-color: color-mix(in srgb, var(--success) 18%, transparent);
  }
  [data-diffs-line-type='deletion'] {
    background-color: color-mix(in srgb, var(--danger) 18%, transparent);
  }
  [data-diffs-line-type='change-addition'] {
    background-color: color-mix(in srgb, var(--success) 22%, transparent);
  }
  [data-diffs-line-type='change-deletion'] {
    background-color: color-mix(in srgb, var(--danger) 22%, transparent);
  }
}
`,
    []
  );

  const hasDiff = Boolean(diff && diff.trim());
  const renderEmpty = <div className={styles.empty}>No diff content.</div>;

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      {!hideToolbar && (
        <div className={styles.toolbar}>
          <Checkbox className={styles.toggle} checked={split} onChange={(value) => handleSplitChange(Boolean(value))}>
            <span className={styles.toggleLabel}>side-by-side</span>
          </Checkbox>
        </div>
      )}
      <div className={styles.viewer}>
        {!hasDiff ? (
          renderEmpty
        ) : (
          <WorkerPoolContextProvider poolOptions={{ workerFactory: createWorker, poolSize: 4 }} highlighterOptions={{}}>
            <PatchDiff
              patch={diff}
              options={{
                theme: themeProp,
                themeType,
                diffStyle: split ? 'split' : 'unified',
                onLineClick: handleLineClick,
                unsafeCSS,
                // Sticky file headers so the path stays visible while the
                // user scrolls long diffs. Pairs with our `stickyHeader`
                // option below for the unified view.
                stickyHeader: true,
                overflow: 'scroll',
              }}
            />
          </WorkerPoolContextProvider>
        )}
      </div>
    </div>
  );
};

export default DiffView;
