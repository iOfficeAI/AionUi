/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import './initBridge';
import initStorage from './initStorage';

app.whenReady().then(() => {
  initStorage();
});
