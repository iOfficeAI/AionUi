/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AionrsAgent } from '@process/agent/aionrs';
import { forkTask } from './utils';

export default forkTask(({ data }, pipe) => {
  pipe.log('aionrs.init', data);

  // Track registered confirmation listeners to prevent duplicate pipe.once registrations.
  // Same deduplication pattern as gemini worker.
  const registeredConfirmCallIds = new Set<string>();
  const confirmCallbacks = new Map<string, (key: string) => void>();

  const agent = new AionrsAgent({
    ...data,
    onStreamEvent(event) {
      if (event.type === 'tool_group') {
        event.data = (event.data as any[]).map((tool: any) => {
          const { confirmationDetails, ...other } = tool;

          if (confirmationDetails && tool.status === 'Confirming') {
            // For aionrs, approval goes through the binary's stdin
            const onConfirm = (confirmKey: string) => {
              if (confirmKey === 'cancel') {
                agent.denyTool(tool.callId, 'User cancelled');
              } else {
                const scope = confirmKey === 'proceed_always' ? 'always' : 'once';
                agent.approveTool(tool.callId, scope);
              }
            };

            confirmCallbacks.set(tool.callId, onConfirm);

            if (!registeredConfirmCallIds.has(tool.callId)) {
              registeredConfirmCallIds.add(tool.callId);
              pipe.once(tool.callId, (confirmKey: string, deferred?: { resolve: (v: unknown) => void }) => {
                const latestOnConfirm = confirmCallbacks.get(tool.callId);
                registeredConfirmCallIds.delete(tool.callId);
                confirmCallbacks.delete(tool.callId);
                if (latestOnConfirm) latestOnConfirm(confirmKey);
                if (deferred?.resolve) deferred.resolve(undefined);
              });
            }

            return { ...other, confirmationDetails };
          }
          return other;
        });
      }

      pipe.call('aionrs.message', event);
    },
  });

  pipe.on('stop.stream', (_, deferred) => {
    agent.stop();
    deferred.with(Promise.resolve());
  });

  pipe.on('init.history', (event: { text: string }, deferred) => {
    deferred.with(agent.injectConversationHistory(event.text));
  });

  pipe.on('send.message', (event: { input: string; msg_id: string; files?: string[] }, deferred) => {
    deferred.with(agent.send(event.input, event.msg_id, event.files));
  });

  return agent.start();
});
