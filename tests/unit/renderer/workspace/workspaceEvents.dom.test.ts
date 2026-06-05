/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_OPEN_REMOTE_CHANGES_EVENT,
  dispatchWorkspaceOpenRemoteChangesEvent,
} from '@/renderer/utils/workspace/workspaceEvents';

describe('dispatchWorkspaceOpenRemoteChangesEvent', () => {
  it('dispatches a conversation-scoped open-remote-changes event', () => {
    const received: string[] = [];
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ conversation_id: string }>).detail;
      received.push(detail.conversation_id);
    };

    window.addEventListener(WORKSPACE_OPEN_REMOTE_CHANGES_EVENT, handler);
    dispatchWorkspaceOpenRemoteChangesEvent('conv-123');
    window.removeEventListener(WORKSPACE_OPEN_REMOTE_CHANGES_EVENT, handler);

    expect(received).toEqual(['conv-123']);
  });
});
