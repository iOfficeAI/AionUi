/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CronService } from './CronService';

let cronServiceInstance: CronService | null = null;

export function registerCronService(service: CronService): CronService {
  cronServiceInstance = service;
  return service;
}

export function getCronService(): CronService | null {
  return cronServiceInstance;
}
