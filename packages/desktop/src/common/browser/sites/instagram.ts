/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ResilientLocator } from '../types';

export const INSTAGRAM_SITE_CONFIG = {
  id: 'instagram',
  name: 'Instagram',
  baseUrl: 'https://www.instagram.com',
  selectors: {
    newPostButton: {
      role: 'link',
      name: 'New post',
      text: 'Create',
      css: 'svg[aria-label="New post"], a[href="#"][role="link"], span:has-text("Create")',
    } satisfies ResilientLocator,
    fileInput: {
      css: 'input[type="file"][accept*="image"], input[type="file"][accept*="video"]',
    } satisfies ResilientLocator,
    nextButton: {
      role: 'button',
      text: 'Next',
      name: 'Next',
      css: 'button:has-text("Next"), div[role="button"]:has-text("Next")',
    } satisfies ResilientLocator,
    captionInput: {
      role: 'textbox',
      placeholder: 'Write a caption...',
      css: 'div[aria-label="Write a caption..."], textarea[placeholder*="caption"]',
    } satisfies ResilientLocator,
    shareSubmitButton: {
      role: 'button',
      text: 'Share',
      name: 'Share',
      css: 'button:has-text("Share"), div[role="button"]:has-text("Share")',
    } satisfies ResilientLocator,
    postConfirmation: {
      text: 'Your post has been shared.',
      css: 'span:has-text("Your post has been shared."), img[alt*="Animated checkmark"]',
    } satisfies ResilientLocator,
  },
};
