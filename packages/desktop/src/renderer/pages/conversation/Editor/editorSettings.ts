/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-workspace editor user preferences. Stored in `localStorage` under
 * `chisl.editor.prefs.${workspaceId ?? '__global__'}` so each conversation /
 * team gets its own font / tab / word-wrap settings, with a shared
 * '__global__' fallback for fresh installs.
 *
 * The shape is intentionally flat — every field has a sensible default in
 * {@link DEFAULT_EDITOR_SETTINGS}, so missing or corrupt JSON is recovered
 * by shallow-merging. `fontFamily` is the one optional string: a falsy
 * value means "let Monaco pick the platform default" rather than
 * overriding it.
 */

const STORAGE_KEY_PREFIX = 'chisl.editor.prefs.';

const storageKey = (workspaceId: string | undefined): string => `${STORAGE_KEY_PREFIX}${workspaceId ?? '__global__'}`;

export type EditorUserSettings = {
  /** Editor body font size in CSS pixels. Default 14. */
  fontSize: number;
  /** Editor body font family. `undefined` = use Monaco default. */
  fontFamily: string | undefined;
  /** Tab stop width. Default 2. */
  tabSize: number;
  /** Whether the editor inserts spaces on Tab. Default true. */
  insertSpaces: boolean;
  /** Word wrap on/off. Default false. */
  wordWrap: boolean;
  /** Minimap visibility. Default false (calm posture). */
  showMinimap: boolean;
  /** Whether whitespace characters are rendered. Default false. */
  renderWhitespace: boolean;
  /** Format document on save. Default false. */
  formatOnSave: boolean;
  /** Default zoom level (alias of `fontSize`; same numeric scale). */
  defaultZoom: number;
};

export const DEFAULT_EDITOR_SETTINGS: EditorUserSettings = {
  fontSize: 14,
  fontFamily: undefined,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: false,
  showMinimap: false,
  renderWhitespace: false,
  formatOnSave: false,
  defaultZoom: 14,
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Resolve the platform's `localStorage`-like object, if any. The renderer
 * uses `window.localStorage`; non-renderer callers (e.g. Node tests) get
 * `globalThis.localStorage` (typically a polyfill installed by the test
 * setup). Returns null when no storage is available.
 */
const getStorage = (): Storage | null => {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return window.localStorage;
  }
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as { localStorage?: Storage }).localStorage !== 'undefined'
  ) {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  }
  return null;
};

/**
 * Read the persisted user-settings blob for a workspace, falling back to
 * {@link DEFAULT_EDITOR_SETTINGS} for missing / corrupt / out-of-range
 * fields. SSR / non-browser callers get the defaults.
 */
export const readEditorSettings = (workspaceId: string | undefined): EditorUserSettings => {
  const storage = getStorage();
  if (!storage) return { ...DEFAULT_EDITOR_SETTINGS };
  try {
    const raw = storage.getItem(storageKey(workspaceId));
    if (!raw) return { ...DEFAULT_EDITOR_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return { ...DEFAULT_EDITOR_SETTINGS };
    return mergeSettings(parsed);
  } catch {
    return { ...DEFAULT_EDITOR_SETTINGS };
  }
};

/**
 * Shallow-merge `partial` over the stored settings (or defaults when nothing
 * is stored yet) and write the result. Unknown fields are dropped; out-of-
 * range numeric fields are clamped. Returns the settings that were actually
 * persisted.
 */
export const writeEditorSettings = (
  workspaceId: string | undefined,
  partial: Partial<EditorUserSettings>
): EditorUserSettings => {
  const current = readEditorSettings(workspaceId);
  const next: EditorUserSettings = sanitizeSettings({ ...current, ...partial });
  const storage = getStorage();
  if (!storage) return next;
  try {
    storage.setItem(storageKey(workspaceId), JSON.stringify(next));
  } catch {
    /* localStorage unavailable — caller can retry */
  }
  return next;
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const clampFontSize = (n: number): number => {
  if (!Number.isFinite(n)) return DEFAULT_EDITOR_SETTINGS.fontSize;
  return Math.max(8, Math.min(40, Math.round(n)));
};

const clampTabSize = (n: number): number => {
  if (!Number.isFinite(n)) return DEFAULT_EDITOR_SETTINGS.tabSize;
  return Math.max(1, Math.min(16, Math.round(n)));
};

const mergeSettings = (raw: Record<string, unknown>): EditorUserSettings => {
  const next: EditorUserSettings = { ...DEFAULT_EDITOR_SETTINGS };
  if (typeof raw.fontSize === 'number') next.fontSize = clampFontSize(raw.fontSize);
  if (typeof raw.fontFamily === 'string') next.fontFamily = raw.fontFamily;
  else if (raw.fontFamily === null) next.fontFamily = undefined;
  if (typeof raw.tabSize === 'number') next.tabSize = clampTabSize(raw.tabSize);
  if (typeof raw.insertSpaces === 'boolean') next.insertSpaces = raw.insertSpaces;
  if (typeof raw.wordWrap === 'boolean') next.wordWrap = raw.wordWrap;
  if (typeof raw.showMinimap === 'boolean') next.showMinimap = raw.showMinimap;
  if (typeof raw.renderWhitespace === 'boolean') next.renderWhitespace = raw.renderWhitespace;
  if (typeof raw.formatOnSave === 'boolean') next.formatOnSave = raw.formatOnSave;
  if (typeof raw.defaultZoom === 'number') next.defaultZoom = clampFontSize(raw.defaultZoom);
  // defaultZoom mirrors fontSize so callers can store either; default to fontSize.
  next.defaultZoom = next.fontSize;
  return next;
};

const sanitizeSettings = (settings: EditorUserSettings): EditorUserSettings => {
  const next: EditorUserSettings = {
    fontSize: clampFontSize(settings.fontSize),
    fontFamily: typeof settings.fontFamily === 'string' ? settings.fontFamily : undefined,
    tabSize: clampTabSize(settings.tabSize),
    insertSpaces: Boolean(settings.insertSpaces),
    wordWrap: Boolean(settings.wordWrap),
    showMinimap: Boolean(settings.showMinimap),
    renderWhitespace: Boolean(settings.renderWhitespace),
    formatOnSave: Boolean(settings.formatOnSave),
    defaultZoom: clampFontSize(settings.defaultZoom),
  };
  // Keep defaultZoom in lock-step with fontSize — they represent the same
  // physical quantity. Callers may persist `defaultZoom` independently for
  // clarity, but the read path normalizes back to fontSize.
  next.defaultZoom = next.fontSize;
  return next;
};
