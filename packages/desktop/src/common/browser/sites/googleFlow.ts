/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ResilientLocator } from '../types';

export const GOOGLE_FLOW_SITE_CONFIG = {
  id: 'google-flow',
  name: 'Google Flow',
  baseUrl: 'https://flow.google.com',
  selectors: {
    promptInput: {
      role: 'textbox',
      placeholder: 'Describe what you want to create',
      css: 'textarea[data-testid="prompt-input"], textarea.prompt-box, [contenteditable="true"]',
    } satisfies ResilientLocator,
    typeSelector: {
      role: 'combobox',
      name: 'Generation type',
      css: 'select[name="type"], [data-testid="type-selector"]',
    } satisfies ResilientLocator,
    generateButton: {
      role: 'button',
      name: 'Generate',
      text: 'Generate',
      css: 'button[data-testid="generate-button"], button.generate-btn',
    } satisfies ResilientLocator,
    progressIndicator: {
      testId: 'generation-progress',
      css: '[data-testid="generation-progress"], .generation-loading, [role="progressbar"]',
    } satisfies ResilientLocator,
    resultAsset: {
      testId: 'generated-asset',
      css: '[data-testid="generated-asset"], video.generated-video, img.generated-image',
    } satisfies ResilientLocator,
    downloadButton: {
      role: 'button',
      name: 'Download',
      text: 'Download',
      css: 'button[data-testid="download-btn"], a[download]',
    } satisfies ResilientLocator,
  },
};
