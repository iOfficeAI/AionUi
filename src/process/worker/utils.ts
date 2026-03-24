/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Pipe } from './fork/pipe';
import pipe from './fork/pipe';

// In server mode, worker processes are forked via child_process.fork (not Electron utilityProcess).
// Tree-sitter WASM is stubbed with an empty Uint8Array, which causes emscripten's abort() to throw
// a WebAssembly.RuntimeError as an unhandled rejection after the try/catch boundary.
// Worker processes are isolated — we log the error but keep the process alive so it can
// continue handling messages. Real crashes (non-WASM) still exit with code 1.
process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes('WebAssembly') || msg.includes('Aborted') || msg.includes('CompileError')) {
    // Expected: tree-sitter WASM stub causes abort() in server mode — shell parsing is non-critical
    console.error('[worker] Non-fatal WASM initialization error (continuing):', msg.split('\n')[0]);
    return;
  }
  console.error('[worker] Unhandled rejection:', reason);
  process.exit(1);
});

export const forkTask = (task: (data?: any, pipe?: Pipe) => Promise<any>) => {
  pipe.on('start', (data: any, deferred) => {
    deferred.with(task(data, pipe));
  });
};
