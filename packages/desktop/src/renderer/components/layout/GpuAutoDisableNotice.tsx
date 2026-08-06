/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Notification } from '@arco-design/web-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GPU_AUTO_DISABLE_ACK_KEY, shouldNotifyGpuAutoDisable } from './gpuAutoDisableDecision';

function readAckedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(GPU_AUTO_DISABLE_ACK_KEY);
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persistAckedAt(lastCrashAt: number): void {
  try {
    window.localStorage.setItem(GPU_AUTO_DISABLE_ACK_KEY, String(lastCrashAt));
  } catch {
    // Best-effort; a failed write only means the notice may show again next launch.
  }
}

/**
 * Renders nothing. On desktop startup it checks GPU auto-recovery status once and,
 * if hardware acceleration was auto-disabled after repeated GPU crashes, shows a
 * single non-blocking notice pointing the user to Settings → System to re-enable.
 * The notice is shown once per crash episode (keyed by lastCrashAt in localStorage).
 */
const GpuAutoDisableNotice: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isElectronDesktop()) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const result = await ipcBridge.application.getGpuStatus.invoke();
        if (cancelled || !result.success || !result.data) {
          return;
        }

        const { autoDisabled, lastCrashAt } = result.data;
        if (!shouldNotifyGpuAutoDisable({ autoDisabled, lastCrashAt }, readAckedAt())) {
          return;
        }

        Notification.warning({
          title: t('settings.hardwareAccelerationAutoDisabledTitle'),
          content: t('settings.hardwareAccelerationAutoDisabledNotice'),
          duration: 10000,
        });

        if (lastCrashAt) {
          persistAckedAt(lastCrashAt);
        }
      } catch {
        // Best-effort startup notice; never let it affect app boot.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [t]);

  return null;
};

export default GpuAutoDisableNotice;
