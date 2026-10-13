/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserProfile } from './types';

export const DEFAULT_BROWSER_PROFILE_ID = 'main';

export const BROWSER_PARTITION_PREFIX = 'persist:aionui-browser-';

export const DEFAULT_EXTERNAL_CHROME_PORT = 9222;

export const DEFAULT_BROWSER_PROFILE: BrowserProfile = {
  id: DEFAULT_BROWSER_PROFILE_ID,
  name: 'Main Profile',
  backend: 'embedded',
  partition: 'persist:aionui-browser',
  isDefault: true,
  createdAt: 0,
  updatedAt: 0,
};

export const COMMON_CHROME_PATHS: Record<'win32' | 'darwin' | 'linux', string[]> = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA || 'C:\\Users\\Default\\AppData\\Local'}\\Google\\Chrome\\Application\\chrome.exe`,
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    `${process.env.HOME || ''}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
};
