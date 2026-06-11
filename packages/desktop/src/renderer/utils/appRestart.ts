/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IAppRestartResult } from '@/common/adapter/ipcBridge';
import { Message } from '@arco-design/web-react';
import type { TFunction } from 'i18next';

export function notifyManualRestartRequired(result: IAppRestartResult | void, t: TFunction): void {
  if (result && result.manualRestartRequired) {
    Message.info(t('settings.restartManualRequired'));
  }
}
