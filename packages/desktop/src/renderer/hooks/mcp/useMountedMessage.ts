/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Message } from '@arco-design/web-react';
import { useEffect, useMemo, useRef } from 'react';

type MessageInstance = ReturnType<typeof Message.useMessage>[0];

/**
 * Wraps an Arco message instance so that calls made after the host component
 * unmounts are dropped silently instead of crashing.
 *
 * Regression guard for ELECTRON-1A1: async MCP callbacks (connection test results,
 * image-generation sync/toggle) can resolve after the user navigates away from the
 * Tools settings. Once the host unmounts, Arco's message context holder becomes null
 * and `message.*` throws `TypeError: Cannot read properties of null (reading 'addInstance')`.
 */
export const useMountedMessage = (message: MessageInstance): MessageInstance => {
  const isMountedRef = useRef(true);
  const messageRef = useRef(message);
  messageRef.current = message;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useMemo(() => {
    const guard =
      (key: keyof MessageInstance) =>
      (...args: unknown[]) => {
        if (!isMountedRef.current) return undefined;
        const fn = messageRef.current[key] as ((...a: unknown[]) => unknown) | undefined;
        if (!fn) return undefined;
        try {
          return fn(...args);
        } catch {
          // Host component unmounted mid-flight — Arco message context is gone, drop silently.
          return undefined;
        }
      };

    return {
      ...messageRef.current,
      info: guard('info'),
      success: guard('success'),
      warning: guard('warning'),
      error: guard('error'),
      normal: guard('normal'),
    } as MessageInstance;
  }, []);
};
