#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resetPassword } from '../src/webserver/index';

// Get username from command line arguments
const username = process.argv[2];

// Initialize Electron environment variables if needed
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

async function main() {
  try {
    console.log('🔄 AionUI Password Reset Utility\n');

    if (username) {
      console.log(`Resetting password for user: ${username}`);
    } else {
      console.log('Showing available users...');
    }

    await resetPassword(username);
  } catch (error) {
    console.error('❌ Password reset failed:', error);
    process.exit(1);
  }
}

main();