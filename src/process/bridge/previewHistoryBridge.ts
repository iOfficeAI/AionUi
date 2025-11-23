/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewHistoryTarget } from '@/common/types/preview';
import { previewHistoryService } from '../services/previewHistoryService';

export function initPreviewHistoryBridge(): void {
  ipcBridge.previewHistory.list.provider(({ target }) => {
    return previewHistoryService.list(target as PreviewHistoryTarget);
  });

  ipcBridge.previewHistory.save.provider(({ target, content }) => {
    return previewHistoryService.save(target as PreviewHistoryTarget, content);
  });

  ipcBridge.previewHistory.getContent.provider(async ({ target, snapshotId }) => {
    const result = await previewHistoryService.getContent(target as PreviewHistoryTarget, snapshotId);
    if (!result) {
      return null;
    }
    return result;
  });
}
