/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Thin forwardRef wrapper around MonacoEditor. VS Code API init runs once in
 * `editorLazyEntry` before this gate mounts — do not call init again here
 * (a second wrapper.start() can trip Codingame's single-load guard).
 */

import React from 'react';
import MonacoEditor, { type MonacoEditorHandle, type MonacoSelectionInfo } from './MonacoEditor';
import type { EditorUserSettings } from './editorSettings';
import type { OpenBuffer } from './types';

type Props = React.ComponentProps<typeof MonacoEditor>;

const MonacoEditorGate = React.forwardRef<MonacoEditorHandle, Props>(function MonacoEditorGate(props, ref) {
  return <MonacoEditor ref={ref} {...props} />;
});

export type { MonacoEditorHandle, MonacoSelectionInfo, EditorUserSettings, OpenBuffer };
export default MonacoEditorGate;
