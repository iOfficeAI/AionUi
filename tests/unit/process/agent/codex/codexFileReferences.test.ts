/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  appendCodexFileReferences,
  CodexFileOperationHandler,
} from '@/process/agent/codex/handlers/CodexFileOperationHandler';

describe('appendCodexFileReferences', () => {
  it('adds uploaded files to the Codex prompt when the user did not type file refs', () => {
    const result = appendCodexFileReferences('can you see this image?', [
      '/workspace/uploads/image_aionui_1778061031862.png',
    ]);

    expect(result).toBe('can you see this image? @/workspace/uploads/image_aionui_1778061031862.png');
  });

  it('does not duplicate a file ref that is already present in the prompt', () => {
    const result = appendCodexFileReferences('inspect @/workspace/uploads/image.png', ['/workspace/uploads/image.png']);

    expect(result).toBe('inspect @/workspace/uploads/image.png');
  });

  it('passes uploaded file refs through the legacy Codex file reference processor', () => {
    const handler = new CodexFileOperationHandler('/workspace', 'conversation-1', {
      emitAndPersistMessage: () => {},
      persistMessage: () => {},
      addConfirmation: () => {},
    });

    const result = handler.processFileReferences('can you see this image?', [
      '/workspace/uploads/image_aionui_1778061031862.png',
    ]);

    expect(result).toBe('can you see this image? @/workspace/uploads/image_aionui_1778061031862.png');
  });
});
