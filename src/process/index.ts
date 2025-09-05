/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import initStorage from './initStorage';

app.whenReady().then(async () => {
  await initStorage();
  // Import initBridge after storage is initialized
  await import('./initBridge');
});
