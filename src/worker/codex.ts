/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodexMcpAgent } from '../agent/codex';
import type { NetworkError } from '../agent/codex/CodexMcpConnection';
import { forkTask } from './utils';

export default forkTask(async ({ data }, pipe) => {
  const agent = new CodexMcpAgent({
    ...data,
    onEvent(event: { type: string; data: any }) {
      pipe.call('codex.event', event);
    },
    onNetworkError(error: NetworkError) {
      pipe.call('codex.networkError', error);
    },
  });

  pipe.on('stop.stream', (_, deferred) => {
    deferred.with(agent.stop());
  });

  pipe.on('send.message', (data, deferred) => {
    deferred.with(agent.sendPrompt(data.prompt || data.message || data));
  });

  pipe.on('resolve.permission', (data, deferred) => {
    agent.resolvePermission(data.requestId, data.result);
    deferred.resolve(undefined);
  });

  return agent.start();
});
