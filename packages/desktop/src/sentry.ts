/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Sentry from '@sentry/electron/main';
import { app } from 'electron';
import { getOrCreateAnalyticsId } from './process/utils/analyticsId';

// 抑制 Chromium GPU 崩溃噪声（参见 ELECTRON-9A / ELECTRON-9D）：
// 自愈逻辑在 gpuRecovery 中处理，事件流量已无价值。
const GPU_CRASH_DROP_PATTERNS = [/'GPU' process exited with /, /IntentionallyCrashBrowserForUnusableGpuProcess/];

export function initSentry(): void {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    beforeSend(event) {
      const haystacks: string[] = [];
      if (event.message) haystacks.push(event.message);
      const exceptions = event.exception?.values ?? [];
      for (const ex of exceptions) {
        if (ex.value) haystacks.push(ex.value);
        const frames = ex.stacktrace?.frames ?? [];
        for (const frame of frames) {
          if (frame.function) haystacks.push(frame.function);
        }
      }
      if (GPU_CRASH_DROP_PATTERNS.some((re) => haystacks.some((h) => re.test(h)))) {
        return null;
      }
      return event;
    },
  });

  Sentry.setTag('app.arch', process.arch);
  Sentry.setTag('app.version', app.getVersion());
  Sentry.setTag('os.name', process.platform);
}

/**
 * Attach the persistent anonymous installation id to the active Sentry scope
 * so every subsequent event (crashes, feedback, startup log report) carries
 * a stable device identifier.
 */
export function setSentryDeviceId(): void {
  const id = getOrCreateAnalyticsId();
  Sentry.setUser({ id });
  Sentry.setTag('device_id', id);
}
