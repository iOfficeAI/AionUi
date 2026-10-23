/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ResilientLocator } from '../types';

export const FACEBOOK_SITE_CONFIG = {
  id: 'facebook',
  name: 'Facebook',
  baseUrl: 'https://www.facebook.com',
  selectors: {
    createPostTrigger: {
      role: 'button',
      text: "What's on your mind",
      css: 'span:has-text("What\'s on your mind"), div[role="button"]:has-text("What\'s on your mind")',
    } satisfies ResilientLocator,
    postDialog: {
      role: 'dialog',
      name: 'Create post',
      css: 'div[role="dialog"]',
    } satisfies ResilientLocator,
    postTextInput: {
      role: 'textbox',
      name: "What's on your mind",
      css: 'div[contenteditable="true"][role="textbox"], textarea[name="xhpc_message"]',
    } satisfies ResilientLocator,
    photoVideoButton: {
      role: 'button',
      name: 'Photo/video',
      text: 'Photo/video',
      css: 'div[aria-label="Photo/video"], span:has-text("Photo/video")',
    } satisfies ResilientLocator,
    fileInput: {
      css: 'input[type="file"][accept*="image,video"]',
    } satisfies ResilientLocator,
    postSubmitButton: {
      role: 'button',
      name: 'Post',
      text: 'Post',
      css: 'div[aria-label="Post"][role="button"], button:has-text("Post")',
    } satisfies ResilientLocator,
  },
};
