/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import initStorage from './initStorage';
import './initBridge';

app
  .whenReady()
  .then(async () => {
    await initStorage();
  })
  .catch((error) => {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  });
