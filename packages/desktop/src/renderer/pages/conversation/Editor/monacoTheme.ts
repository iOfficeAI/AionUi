/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Custom Monaco themes bound to Chisl's semantic CSS variables. Every Monaco
 * "color contribution point" we can reasonably override is wired through the
 * project's tokens so the editor body, gutters, minimap, scrollbars, find
 * widget, peek view, hover/suggest popups, and inline status decorations all
 * share the look of the surrounding toolbar / tabs / status bar.
 *
 * We resolve actual color values from CSS variables at theme-define time so
 * token tweaks flow through without code changes.
 *
 * Post-wrapper behavior: when the Codingame VS Code API wrapper has booted
 * (see `monacoVscodeApiInit.ts`), the service bound to
 * `IStandaloneThemeService` in the standalone service registry may be a
 * workbench-flavored override that does NOT expose `defineTheme`. Calling
 * `monaco.editor.defineTheme` in that state throws
 * `standaloneThemeService.defineTheme is not a function`, which used to mark
 * the editor as unavailable. We probe the service first and, if `defineTheme`
 * is missing, fall back to `monaco.editor.setTheme(base)` so the editor still
 * has a valid base theme instead of failing closed.
 *
 * Why `applyTheme` is separate from `defineTheme`:
 *   The workbench fallback path used to write the same `workbench.colorCustomizations`
 *   block once per `defineTheme` call (light + dark). The two writes race because
 *   `ensureAionuiThemesRegistered` fires both, and `updateUserConfiguration` is a
 *   full-file read-modify-write: whichever call lands second wins, so the active
 *   theme's palette gets overwritten by the inactive one. The editor then mounts
 *   with the wrong colors (or with the default white `vs` surface if the write
 *   hadn't completed before `monaco.editor.setTheme` was called).
 *   The fix is to stop writing user config from `defineTheme` (which has no idea
 *   which mode the user actually wants) and centralize the write inside
 *   `applyTheme(mode)`, which is called once per mode change. There is then no
 *   race and the active palette is always the one the user just selected.
 */

import * as monaco from '@aionui/editor-monaco';
// Best-effort probe: Codingame deep-internal paths to the standalone
// theme service. These imports are wrapped in a try/catch in the helper so
// that a missing/renamed export across minor versions degrades to "unknown"
// instead of crashing module evaluation.
import { StandaloneServices } from '@codingame/monaco-vscode-api/services';
import { IStandaloneThemeService } from '@codingame/monaco-vscode-api/vscode/vs/editor/standalone/common/standaloneTheme.service';

export const AIONUI_LIGHT_THEME = 'aionui-light';
export const AIONUI_DARK_THEME = 'aionui-dark';

type Palette = {
  bg: string;
  bg2: string;
  bg3: string;
  fg: string;
  fgSecondary: string;
  fgTertiary: string;
  cursor: string;
  selection: string;
  selectionInactive: string;
  lineHighlight: string;
  gutterFg: string;
  brand: string;
  brandSoft: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  shadow: string;
};

const FALLBACK_LIGHT: Palette = {
  bg: '#f0e4b4',
  bg2: '#e8d8a8',
  bg3: '#d8c088',
  fg: '#303024',
  fgSecondary: '#4a4434',
  fgTertiary: '#6b5f48',
  cursor: '#303024',
  selection: '#ecdfb6',
  selectionInactive: '#e8d8a8',
  lineHighlight: '#ecdfb6',
  gutterFg: '#6b5f48',
  brand: '#b4480c',
  brandSoft: '#f4ead0',
  success: '#607848',
  warning: '#c08418',
  danger: '#9b3514',
  info: '#3c786c',
  shadow: '#3c383014',
};

const FALLBACK_DARK: Palette = {
  bg: '#28241d',
  bg2: '#322c22',
  bg3: '#3d3528',
  fg: '#ecdfb6',
  fgSecondary: '#d6c08c',
  fgTertiary: '#b8a378',
  cursor: '#ecdfb6',
  selection: '#4a4030',
  selectionInactive: '#3d3528',
  lineHighlight: '#322c22',
  gutterFg: '#b8a378',
  brand: '#e07820',
  brandSoft: '#322c22',
  success: '#8aa860',
  warning: '#e4b430',
  danger: '#d6582c',
  info: '#6caa9c',
  shadow: '#00000033',
};

function resolveCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) return fallback;
  if (value.startsWith('#')) return value.length === 9 ? value : value; // accept #RGBA too
  if (value.startsWith('rgb')) return rgbToHex(value) ?? fallback;
  // hsl()/oklch()/etc. — Monaco can't parse, fall back rather than ship garbage.
  return fallback;
}

function rgbToHex(rgb: string): string | null {
  // Handles `rgb(r,g,b)` and `rgba(r,g,b,a)`. Alpha → 2-digit hex appended.
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/);
  if (!m) return null;
  const r = Number.parseInt(m[1], 10);
  const g = Number.parseInt(m[2], 10);
  const b = Number.parseInt(m[3], 10);
  const a = m[4] !== undefined ? Math.round(Number.parseFloat(m[4]) * 255) : null;
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}${a !== null ? hex(a) : ''}`;
}

/** Append a 2-digit alpha to a 6-digit hex (`#RRGGBB` → `#RRGGBBAA`). */
function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

function loadPalette(fb: Palette): Palette {
  return {
    bg: resolveCssVar('--bg-1', fb.bg),
    bg2: resolveCssVar('--bg-2', fb.bg2),
    bg3: resolveCssVar('--bg-3', fb.bg3),
    fg: resolveCssVar('--text-primary', fb.fg),
    fgSecondary: resolveCssVar('--text-secondary', fb.fgSecondary),
    fgTertiary: resolveCssVar('--text-tertiary', fb.fgTertiary),
    cursor: resolveCssVar('--text-primary', fb.cursor),
    selection: fb.selection,
    selectionInactive: fb.selectionInactive,
    lineHighlight: resolveCssVar('--bg-2', fb.lineHighlight),
    gutterFg: resolveCssVar('--text-secondary', fb.gutterFg),
    brand: resolveCssVar('--brand', fb.brand),
    brandSoft: resolveCssVar('--brand-light', fb.brandSoft),
    success: fb.success,
    warning: fb.warning,
    danger: fb.danger,
    info: fb.info,
    shadow: fb.shadow,
  };
}

/**
 * Probe `IStandaloneThemeService` to detect the workbench override that
 * lacks `defineTheme`. Returns `true` only when the service is reachable
 * AND the bound instance has no `defineTheme` function (the
 * "defineTheme is not a function" failure mode). `false` (or an
 * inconclusive probe) lets the caller fall through to the try/catch
 * safety net around the real `monaco.editor.defineTheme` call.
 *
 * This is best-effort: if `StandaloneServices` or `IStandaloneThemeService`
 * is missing/renamed across Codingame minor versions, the helper returns
 * `false` and the runtime try/catch is the authoritative check.
 */
function probeDefineThemeMissing(): boolean {
  try {
    if (typeof StandaloneServices?.get !== 'function' || !IStandaloneThemeService) {
      return false;
    }
    const svc = StandaloneServices.get(IStandaloneThemeService) as { defineTheme?: unknown } | undefined;
    if (!svc) return false;
    return typeof svc.defineTheme !== 'function';
  } catch {
    return false;
  }
}

/**
 * Build the Monaco editor `colors` dictionary from the resolved palette.
 * Shared between the `monaco.editor.defineTheme` happy path and the
 * workbench `workbench.colorCustomizations` fallback so the editor surface
 * always reflects the same CSS-variable-driven palette, regardless of which
 * theme service is in scope. VS Code's theme service reads the exact same
 * keys under `workbench.colorCustomizations` (e.g. `editor.background`,
 * `editor.foreground`, `minimap.background`, …), so this single map is
 * usable in both Monaco and VS Code configuration shapes.
 */
function buildThemeColors(p: Palette): Record<string, string> {
  return {
    // ───── Editor body ─────────────────────────────────────────────────────
    'editor.background': p.bg,
    'editor.foreground': p.fg,
    'editor.lineHighlightBackground': p.lineHighlight,
    'editor.lineHighlightBorder': '#00000000', // suppress the default 1px outline
    'editor.selectionBackground': p.selection,
    'editor.inactiveSelectionBackground': p.selectionInactive,
    'editor.selectionHighlightBackground': withAlpha(p.brand, 0.18),
    'editor.wordHighlightBackground': withAlpha(p.brand, 0.14),
    'editor.wordHighlightStrongBackground': withAlpha(p.brand, 0.22),
    'editor.findMatchBackground': withAlpha(p.warning, 0.55),
    'editor.findMatchHighlightBackground': withAlpha(p.warning, 0.28),
    'editor.findRangeHighlightBackground': withAlpha(p.brand, 0.1),
    'editor.rangeHighlightBackground': withAlpha(p.brand, 0.08),

    // ───── Cursor / whitespace ─────────────────────────────────────────────
    'editorCursor.foreground': p.cursor,
    'editorWhitespace.foreground': withAlpha(p.fgTertiary, 0.5),
    'editorIndentGuide.background': p.bg3,
    'editorIndentGuide.activeBackground': withAlpha(p.brand, 0.5),
    'editorRuler.foreground': p.bg3,

    // ───── Line numbers / gutter ───────────────────────────────────────────
    'editorLineNumber.foreground': p.fgTertiary,
    'editorLineNumber.activeForeground': p.fg,
    'editorGutter.background': p.bg,
    'editorGutter.modifiedBackground': p.warning,
    'editorGutter.addedBackground': p.success,
    'editorGutter.deletedBackground': p.danger,

    // ───── Brackets ────────────────────────────────────────────────────────
    'editorBracketMatch.background': withAlpha(p.brand, 0.18),
    'editorBracketMatch.border': withAlpha(p.brand, 0.6),

    // ───── Diagnostics ─────────────────────────────────────────────────────
    'editorError.foreground': p.danger,
    'editorWarning.foreground': p.warning,
    'editorInfo.foreground': p.info,
    'editorHint.foreground': p.fgSecondary,
    'editorOverviewRuler.errorForeground': p.danger,
    'editorOverviewRuler.warningForeground': p.warning,
    'editorOverviewRuler.infoForeground': p.info,
    'editorOverviewRuler.border': p.bg3,
    'editorOverviewRuler.findMatchForeground': p.warning,
    'editorOverviewRuler.selectionHighlightForeground': p.brand,

    // ───── Minimap ─────────────────────────────────────────────────────────
    'minimap.background': p.bg,
    'minimap.selectionHighlight': withAlpha(p.brand, 0.5),
    'minimap.findMatchHighlight': p.warning,
    'minimap.errorHighlight': p.danger,
    'minimap.warningHighlight': p.warning,
    'minimapSlider.background': withAlpha(p.fgTertiary, 0.2),
    'minimapSlider.hoverBackground': withAlpha(p.fgTertiary, 0.35),
    'minimapSlider.activeBackground': withAlpha(p.fgTertiary, 0.5),
    'minimapGutter.addedBackground': p.success,
    'minimapGutter.modifiedBackground': p.warning,
    'minimapGutter.deletedBackground': p.danger,

    // ───── Scrollbars ──────────────────────────────────────────────────────
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': withAlpha(p.fgTertiary, 0.25),
    'scrollbarSlider.hoverBackground': withAlpha(p.fgTertiary, 0.45),
    'scrollbarSlider.activeBackground': withAlpha(p.fgTertiary, 0.6),

    // ───── Find widget ─────────────────────────────────────────────────────
    // Match Arco popup elevation: bg-2 surface, border-base outline, soft shadow.
    'editorWidget.background': p.bg2,
    'editorWidget.foreground': p.fg,
    'editorWidget.border': p.bg3,
    'editorWidget.resizeBorder': p.brand,

    // Input fields inside widgets (find box, replace box, go-to-line input)
    'input.background': p.bg,
    'input.foreground': p.fg,
    'input.border': p.bg3,
    'input.placeholderForeground': p.fgTertiary,
    'inputOption.activeBackground': withAlpha(p.brand, 0.18),
    'inputOption.activeBorder': p.brand,
    'inputOption.activeForeground': p.brand,
    'inputValidation.errorBackground': withAlpha(p.danger, 0.16),
    'inputValidation.errorBorder': p.danger,
    'inputValidation.warningBackground': withAlpha(p.warning, 0.16),
    'inputValidation.warningBorder': p.warning,
    'inputValidation.infoBackground': withAlpha(p.info, 0.16),
    'inputValidation.infoBorder': p.info,

    // ───── Suggest / hover / parameter-hint widgets ────────────────────────
    'editorSuggestWidget.background': p.bg2,
    'editorSuggestWidget.border': p.bg3,
    'editorSuggestWidget.foreground': p.fg,
    'editorSuggestWidget.selectedBackground': withAlpha(p.brand, 0.18),
    'editorSuggestWidget.selectedForeground': p.fg,
    'editorSuggestWidget.highlightForeground': p.brand,
    'editorSuggestWidget.focusHighlightForeground': p.brand,
    'editorHoverWidget.background': p.bg2,
    'editorHoverWidget.border': p.bg3,
    'editorHoverWidget.foreground': p.fg,
    'editorHoverWidget.statusBarBackground': p.bg3,

    // ───── Lists (used inside suggest / quick-open / go-to-line) ────────────
    'list.hoverBackground': p.bg3,
    'list.hoverForeground': p.fg,
    'list.focusBackground': withAlpha(p.brand, 0.18),
    'list.focusForeground': p.fg,
    'list.activeSelectionBackground': withAlpha(p.brand, 0.2),
    'list.activeSelectionForeground': p.fg,
    'list.inactiveSelectionBackground': withAlpha(p.brand, 0.12),
    'list.inactiveSelectionForeground': p.fg,
    'list.highlightForeground': p.brand,

    // ───── Quick-input (go-to-line / command palette) ──────────────────────
    'quickInput.background': p.bg2,
    'quickInput.foreground': p.fg,
    'quickInputTitle.background': p.bg2,
    'pickerGroup.foreground': p.fgSecondary,
    'pickerGroup.border': p.bg3,

    // ───── Buttons (e.g. find widget toggles) ──────────────────────────────
    'button.background': p.brand,
    'button.foreground': '#ffffff',
    'button.hoverBackground': resolveCssVar('--brand-hover', p.brand),
    'button.secondaryBackground': p.bg3,
    'button.secondaryForeground': p.fg,

    // ───── Peek view (used by go-to-definition) ────────────────────────────
    'peekView.border': p.brand,
    'peekViewEditor.background': p.bg,
    'peekViewEditor.matchHighlightBackground': withAlpha(p.warning, 0.32),
    'peekViewEditorGutter.background': p.bg,
    'peekViewResult.background': p.bg2,
    'peekViewResult.fileForeground': p.fg,
    'peekViewResult.lineForeground': p.fgSecondary,
    'peekViewResult.matchHighlightBackground': withAlpha(p.warning, 0.32),
    'peekViewResult.selectionBackground': withAlpha(p.brand, 0.18),
    'peekViewResult.selectionForeground': p.fg,
    'peekViewTitle.background': p.bg2,
    'peekViewTitleLabel.foreground': p.fg,
    'peekViewTitleDescription.foreground': p.fgSecondary,

    // ───── Misc ────────────────────────────────────────────────────────────
    focusBorder: p.brand,
    foreground: p.fg,
    'icon.foreground': p.fgSecondary,
    'editorLink.activeForeground': p.brand,
    'editorGroup.border': p.bg3,
    'sash.hoverBorder': p.brand,
    contrastBorder: '#00000000',
  };
}

/** Safely call `monaco.editor.setTheme`; log + swallow on failure. */
function safeSetTheme(name: string): void {
  try {
    monaco.editor.setTheme(name);
  } catch (setErr) {
    // eslint-disable-next-line no-console
    console.warn('[monacoTheme] monaco.editor.setTheme(' + name + ') failed; theme will be unset.', setErr);
  }
}

async function defineTheme(name: string, base: 'vs' | 'vs-dark', fb: Palette): Promise<void> {
  // Defensive: after `MonacoVscodeApiWrapper.start()` the service bound to
  // `IStandaloneThemeService` may be a workbench override that lacks
  // `defineTheme`. In that case we cannot register a custom Monaco theme
  // (the aionui-light / aionui-dark names are not in the registry), so
  // calling `monaco.editor.setTheme(aionui-light)` would silently no-op and
  // the editor would mount with the default white `vs` surface.
  //
  // We still set the base theme synchronously here so the editor has a
  // valid base color scheme before `applyTheme` (called on mount) writes
  // the actual `workbench.colorCustomizations` palette. The user-visible
  // color customization is now driven exclusively by `applyTheme`, which
  // is called once per mode change — there is no longer a write race
  // between light and dark registrations, and the active palette is
  // always the one the user just selected.
  if (probeDefineThemeMissing()) {
    safeSetTheme(base);
    return;
  }

  // Standalone path: register the custom Monaco theme.
  const p = loadPalette(fb);
  const colors = buildThemeColors(p);
  try {
    monaco.editor.defineTheme(name, {
      base,
      inherit: true,
      rules: [],
      colors,
    });
  } catch (defineErr) {
    // Final safety net: the probe above may not catch every override shape.
    // If `defineTheme` still throws, downgrade to `setTheme(base)` and log.
    // eslint-disable-next-line no-console
    console.warn(
      '[monacoTheme] monaco.editor.defineTheme(' + name + ') threw; falling back to setTheme(' + base + ').',
      defineErr
    );
    safeSetTheme(base);
  }
}

let themesRegistered = false;

export function ensureAionuiThemesRegistered(): void {
  if (themesRegistered) return;
  themesRegistered = true;
  // `defineTheme` is intentionally synchronous — its body has no
  // `await` in either path (the workbench write moved to `applyTheme`),
  // so the per-mode registration lands before this function returns.
  // Keeping it sync means `monaco.editor.create({ theme: ... })` can
  // rely on the aionui names being in the registry immediately after
  // `ensureAionuiThemesRegistered()` returns.
  defineTheme(AIONUI_LIGHT_THEME, 'vs', FALLBACK_LIGHT);
  defineTheme(AIONUI_DARK_THEME, 'vs-dark', FALLBACK_DARK);
}

export function themeNameFor(mode: 'light' | 'dark'): string {
  return mode === 'dark' ? AIONUI_DARK_THEME : AIONUI_LIGHT_THEME;
}

/**
 * Return the theme name to pass as the `theme` option to
 * `monaco.editor.create(..., { theme })` for a given mode. In the
 * workbench path the aionui themes are not registered, so we hand back
 * the built-in base (`'vs'` / `'vs-dark'`) so the editor never mounts
 * with an unknown name. Callers should still call `applyTheme(mode)`
 * afterwards so the user's palette is applied via
 * `workbench.colorCustomizations`.
 */
export function initialThemeFor(mode: 'light' | 'dark'): string {
  return probeDefineThemeMissing() ? (mode === 'dark' ? 'vs-dark' : 'vs') : themeNameFor(mode);
}

/**
 * Apply the active editor palette for `mode` regardless of which theme
 * service is in scope.
 *
 * - Standalone path (`probeDefineThemeMissing() === false`): just switch
 *   to the registered aionui theme.
 * - Workbench path (`probeDefineThemeMissing() === true`): synchronously
 *   set the matching built-in base theme (`'vs'` / `'vs-dark'`) so the
 *   editor has a valid color scheme immediately, then write the user's
 *   `workbench.colorTheme` and `workbench.colorCustomizations` keys via
 *   the configuration service so the workbench theme service re-paints
 *   the editor surface with the Chisl palette (replacing the default
 *   white background). On any write failure we fall back to the base
 *   theme so the editor still mounts.
 *
 * Centralizing the user-config write here is what fixes the
 * "white background" / "doesn't fit my color schemes" report: the old
 * design wrote `workbench.colorCustomizations` once per
 * `ensureAionuiThemesRegistered` call (light + dark), and the second
 * write clobbered the first. Now the write happens exactly once, on
 * the actual mode change.
 */
export async function applyTheme(mode: 'light' | 'dark'): Promise<void> {
  const base: 'vs' | 'vs-dark' = mode === 'dark' ? 'vs-dark' : 'vs';
  const fb = mode === 'dark' ? FALLBACK_DARK : FALLBACK_LIGHT;

  if (!probeDefineThemeMissing()) {
    // Standalone path: switch to the registered aionui theme.
    safeSetTheme(themeNameFor(mode));
    return;
  }

  // Workbench path: set the built-in base synchronously so the editor
  // already has a valid color scheme if the configuration-service write
  // is slow (or fails). `vs` / `vs-dark` are guaranteed to exist because
  // `monacoVscodeApiInit.ts` boots with `loadThemes: false`, so no
  // extension themes are registered.
  safeSetTheme(base);

  try {
    // Dynamic import: the configuration-service-override module is only
    // needed here, and loading it lazily avoids pulling the bundle into
    // the `editorLazyEntry` evaluation path before the wrapper has
    // booted and registered the `IConfigurationService` override.
    const { getUserConfiguration, updateUserConfiguration } =
      await import('@codingame/monaco-vscode-configuration-service-override');
    // Read the existing user settings so we don't clobber the
    // `editor.wordBasedSuggestions` / `editor.quickSuggestions` overrides
    // configured in `monacoVscodeApiInit.ts`'s `userConfiguration` boot
    // payload. `getUserConfiguration` returns the entire `settings.json`
    // string; merge our keys into it.
    const next: Record<string, unknown> = {};
    try {
      const current = await getUserConfiguration();
      if (current) {
        const parsed = JSON.parse(current) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.assign(next, parsed as Record<string, unknown>);
        }
      }
    } catch {
      // Best-effort: fall through with an empty base. The only keys we
      // touch below are `workbench.colorCustomizations` and
      // `editor.tokenColorCustomizations`, so a missing file is fine.
    }
    // `workbench.colorCustomizations` accepts a flat colorId → hex map
    // (optionally scoped by theme id, e.g. `"[vs-dark]": { ... }`). We
    // set `workbench.colorTheme` to the matching base and apply the
    // customizations globally; the workbench theme service then
    // re-picks colors for the active base. This is the same effect as
    // Monaco's `defineTheme({ base, inherit: true, colors })` from the
    // user-visible "what does the editor body look like" standpoint.
    next['workbench.colorTheme'] = base;
    next['workbench.colorCustomizations'] = buildThemeColors(loadPalette(fb));
    // Mirror the empty `rules: []` from the Monaco happy path so the
    // two configuration surfaces stay aligned. (No custom textmate rules
    // yet; token-color customization is reserved for a follow-up.)
    next['editor.tokenColorCustomizations'] = { textMateRules: [] };
    // `updateUserConfiguration` expects a JSON string and writes it
    // wholesale to the user-data settings resource; the configuration
    // service will pick it up and the workbench theme service will
    // re-apply colors immediately.
    await updateUserConfiguration(JSON.stringify(next));
  } catch (cfgErr) {
    // Last-resort safety net: if the configuration-service-override
    // module can't be loaded (missing/renamed export across minor
    // versions) or the file write fails, the synchronous `safeSetTheme`
    // call above already mounted the editor with a valid base theme —
    // log so the dev can see why the user's palette didn't take.
    // eslint-disable-next-line no-console
    console.warn(
      '[monacoTheme] applyTheme(' + mode + '): updateUserConfiguration failed; editor will use the base theme only.',
      cfgErr
    );
  }
}
