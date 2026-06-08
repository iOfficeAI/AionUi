/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { EditorProvider, useEditorContext, useEditorContextSafe } from './EditorContext';
export { default as EditorTabs } from './EditorTabs';
// Editor UI (Monaco + LSP): import only via React.lazy('./editorLazyEntry') — not from this barrel.
export * from './editorLanguage';
export {
  DEFAULT_EDITOR_SETTINGS,
  readEditorSettings,
  writeEditorSettings,
  type EditorUserSettings,
} from './editorSettings';
export {
  EDITOR_REVEAL_PATH_EVENT,
  isEditorRevealPathEvent,
  relativePathFromWorkspace,
  requestEditorRevealInTree,
  type EditorRevealPathDetail,
} from './editorReveal';
export {
  clearEditorTabs,
  readEditorTabs,
  writeEditorTabs,
  type EditorTabsHydrationFlag,
  type PersistedEditorTabEntry,
  type PersistedEditorTabs,
} from './editorTabsPersistence';
export { decorationsFromUnifiedPatch, type GitLineDecoration } from './gitDecorationsFromPatch';
export type * from './types';
