/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Force node-gyp-build to skip build/ directory and use prebuilds/ only
// This prevents loading wrong architecture binaries from development environment
process.env.PREBUILDS_ONLY = '1';

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
