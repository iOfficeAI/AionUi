/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helpers for injecting user-selected background images into theme CSS.
 */

export const BACKGROUND_BLOCK_START = '/* AionUi Theme Background Start */';
export const BACKGROUND_BLOCK_END = '/* AionUi Theme Background End */';

// Precompiled regex for better performance / 预编译正则以提升性能
const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BACKGROUND_BLOCK_PATTERN = new RegExp(`${escapeRegex(BACKGROUND_BLOCK_START)}[\\s\\S]*?${escapeRegex(BACKGROUND_BLOCK_END)}\n?`, 'g');

const buildBackgroundCss = (imageDataUrl: string): string => {
  if (!imageDataUrl) return '';
  return `${BACKGROUND_BLOCK_START}
/* 根容器设置背景图 / Root container background image */
body,
html,
.arco-layout,
.app-shell {
  background-image: url("${imageDataUrl}");
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center center;
  background-attachment: fixed;
  background-color: transparent;
}

/* 内部容器透明化，让背景图穿透 / Make inner containers transparent */
.layout-content,
.layout-content.bg-1,
.arco-layout-content,
[class*="chat-layout"] .arco-layout-content,
[class*="conversation"] .arco-layout-content,
.bg-1,
.bg-2:not(.app-titlebar),
[class*="flex-col"][class*="h-full"],
[class*="flex-center"] {
  background-color: transparent;
  background-image: none;
}

/* 确保伪元素也透明 / Ensure pseudo elements are transparent */
.layout-content::before,
.layout-content.bg-1::before,
[class*="chat-layout"] .arco-layout-content::before,
[class*="conversation"] .arco-layout-content::before {
  background: transparent;
  opacity: 0;
}
${BACKGROUND_BLOCK_END}`;
};

/**
 * Inject (or replace) the standard background CSS block using the provided image.
 */
export const injectBackgroundCssBlock = (css: string, imageDataUrl: string): string => {
  if (!css) {
    return buildBackgroundCss(imageDataUrl);
  }
  // Reset lastIndex for global regex reuse / 重置 lastIndex 以重用全局正则
  BACKGROUND_BLOCK_PATTERN.lastIndex = 0;
  const cleanedCss = css.replace(BACKGROUND_BLOCK_PATTERN, '').trim();
  const block = buildBackgroundCss(imageDataUrl);
  return [cleanedCss, block].filter(Boolean).join('\n\n');
};
