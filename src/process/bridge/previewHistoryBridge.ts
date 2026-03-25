/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewHistoryTarget } from '@/common/types/preview';
import { previewHistoryService } from '../services/previewHistoryService';

export function initPreviewHistoryBridge(): void {
  // 预览历史：列出指定目标的所有快照 / List history snapshots for the provided target
  ipcBridge.previewHistory.list.provider(({ target }) => {
    return previewHistoryService.list(target as PreviewHistoryTarget);
  });

  // 预览历史：保存新的快照内容 / Persist new snapshot content for the target
  ipcBridge.previewHistory.save.provider(({ target, content }) => {
    return previewHistoryService.save(target as PreviewHistoryTarget, content);
  });

  // 预览历史：获取某个快照的具体内容 / Fetch the content payload of a specific snapshot
  ipcBridge.previewHistory.getContent.provider(async ({ target, snapshotId }) => {
    const result = await previewHistoryService.getContent(target as PreviewHistoryTarget, snapshotId);
    if (!result) {
      return null;
    }
    return result;
  });
}
