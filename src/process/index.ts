/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import { initHeadlessMode } from '../utils/initHeadlessMode';

// Initialize headless mode before accessing app properties
// 在访问 app 属性之前初始化 headless 模式
initHeadlessMode();

// Force node-gyp-build to skip build/ directory and use prebuilds/ only in production
// This prevents loading wrong architecture binaries from development environment
// Only apply in packaged app to allow development builds to use build/Release/
if (app.isPackaged) {
  process.env.PREBUILDS_ONLY = '1';
}
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
