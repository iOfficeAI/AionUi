/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ThemeConfig } from './types';
import { defaultLightTheme } from './light';
import { ideaDarkTheme } from './dark';
import { darkGreenTheme } from './darkGreen';

export const themeConfig: ThemeConfig = {
  currentTheme: 'default-light',
  autoMode: true,
  themes: {
    [defaultLightTheme.id]: defaultLightTheme,
    [ideaDarkTheme.id]: ideaDarkTheme,
    [darkGreenTheme.id]: darkGreenTheme,
  },
  // 默认的亮色和暗色主题偏好
  preferredLightTheme: 'default-light',
  preferredDarkTheme: 'idea-dark',
};

export * from './types';
export * from './light';
export * from './dark';
export * from './darkGreen';
export * from './ThemeProvider';
export * from './hooks';
export * from './external';
