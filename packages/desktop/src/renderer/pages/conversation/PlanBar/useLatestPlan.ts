/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessagePlan, TMessage } from '@/common/chat/chatLib';
import { useMessageList } from '@renderer/pages/conversation/Messages/hooks';
import { useMemo } from 'react';

/**
 * Newest plan snapshot in a message list, or undefined.
 *
 * A plan is a full-replacement snapshot, so only the latest one is meaningful.
 * Plans stay in the message list — that is how live merge, history load and
 * pagination all reuse the existing machinery — but never render as a row.
 */
export const selectLatestPlan = (list: TMessage[]): IMessagePlan | undefined => {
  let latest: IMessagePlan | undefined;
  for (const message of list) {
    if (message.type !== 'plan') continue;
    if (!latest || (message.created_at ?? 0) > (latest.created_at ?? 0)) {
      latest = message;
    }
  }
  return latest;
};

export const useLatestPlan = (): IMessagePlan | undefined => {
  const list = useMessageList();
  return useMemo(() => selectLatestPlan(list), [list]);
};
