/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Monaco worker bootstrap. Vite's `?worker` import packages each worker as a
 * separate chunk; the function returned by each import constructs a Worker
 * targeting that chunk. We set `MonacoEnvironment.getWorker` once before any
 * `monaco.editor.create()` call so the editor finds the right worker for each
 * built-in language. Without this, Monaco falls back to a same-origin worker
 * URL that Electron's file:// protocol cannot load — completion/diagnostics
 * silently die and the editor feels "generic and barebones".
 */

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

let installed = false;

export function ensureMonacoEnvironment(): void {
  if (installed) return;
  installed = true;
  // Monaco's own type for MonacoEnvironment is wider than we need; cast to
  // unknown then to the loose shape we set so we don't have to import the
  // entire `monaco.Environment` interface just to write a getWorker.
  (self as unknown as { MonacoEnvironment: { getWorker: (id: string, label: string) => Worker } }).MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      switch (label) {
        case 'json':
          return new jsonWorker();
        case 'css':
        case 'scss':
        case 'less':
          return new cssWorker();
        case 'html':
        case 'handlebars':
        case 'razor':
          return new htmlWorker();
        case 'typescript':
        case 'javascript':
          return new tsWorker();
        default:
          return new editorWorker();
      }
    },
  };
}
