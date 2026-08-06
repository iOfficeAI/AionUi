/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 应用内浏览器 tab 的共享常量与地址栏输入解析
 * Shared constants and address-bar input parsing for in-app browser tabs
 */

/**
 * 从 common 重新导出，方便浏览器相关代码就近取用。
 * 定义在 common 是因为主进程清理登录态时也要用同一个值。
 *
 * Re-exported from common so browser code can reach it locally. It is defined in
 * common because the main process needs the same value when clearing sign-in state.
 */
export { BROWSER_SESSION_PARTITION } from '@/common/config/constants';

/** 新建浏览器 tab 的初始地址 / Initial address for a freshly opened browser tab. */
export const BROWSER_BLANK_URL = 'about:blank';

/**
 * 浏览器 tab 的占位标题，页面标题就绪后会被替换。
 * Placeholder title for a browser tab, replaced once the page title arrives.
 */
export const BROWSER_TAB_FALLBACK_TITLE = 'New Tab';

/**
 * 浏览器 tab 数量上限：超过则提示用户先关闭旧 tab，避免每个 tab 一个 webview
 * 进程把内存吃满。
 *
 * Cap on browser tabs: each tab is a separate webview process, so an unbounded
 * count would exhaust memory. Beyond this the user is asked to close old tabs.
 */
export const MAX_BROWSER_TABS = 10;

/** 默认搜索引擎，地址栏输入非 URL 时使用 / Default search engine for non-URL input. */
const SEARCH_URL_TEMPLATE = 'https://www.bing.com/search?q={query}';

/**
 * 已知的无主机名 scheme：这些直接原样通过，不做域名猜测。
 * Schemes with no host part — passed through untouched, never guessed at.
 */
const PASSTHROUGH_SCHEMES = ['about:', 'data:', 'blob:', 'chrome:', 'devtools:', 'view-source:'];

/** 显式带 scheme 的输入 / Input that explicitly carries a scheme. */
const EXPLICIT_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * 看起来像主机名的输入：`example.com`、`localhost:3000`、`192.168.1.5/x`。
 * 要求首段之后存在一个 TLD 式后缀，或是带端口的 localhost / IP。
 *
 * Host-like input: `example.com`, `localhost:3000`, `192.168.1.5/x`. Requires a
 * TLD-ish suffix, or localhost/IP with a port.
 */
const HOST_LIKE_RE = /^(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i;
const LOCALHOST_RE = /^localhost(?::\d+)?(?:[/?#].*)?$/i;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/?#].*)?$/;

/**
 * 把地址栏输入解析成可导航的 URL。
 *
 * 输入可能是完整 URL、裸域名，或一句要搜索的话 —— 这个函数决定去哪。
 * 含空格的输入一律当搜索词：`example.com/a b` 不是有效主机名，而
 * "如何配置 nginx" 明显是在搜东西。
 *
 * Resolve address-bar input into a navigable URL. Input may be a full URL, a
 * bare hostname, or a search phrase. Anything containing whitespace is treated
 * as a search query.
 */
export const resolveAddressBarInput = (raw: string): string | null => {
  const input = raw.trim();
  if (!input) return null;

  const lower = input.toLowerCase();
  if (PASSTHROUGH_SCHEMES.some((scheme) => lower.startsWith(scheme))) return input;
  if (EXPLICIT_SCHEME_RE.test(input)) return input;

  // Whitespace never appears in a hostname, so this is a search phrase.
  if (!/\s/.test(input)) {
    if (LOCALHOST_RE.test(input) || IPV4_RE.test(input) || HOST_LIKE_RE.test(input)) {
      return `https://${input}`;
    }
  }

  return SEARCH_URL_TEMPLATE.replace('{query}', encodeURIComponent(input));
};

/**
 * 供 tab 标题使用的紧凑标签，页面还没给出标题时用主机名兜底。
 * Compact label for a tab title, falling back to the hostname before a real
 * page title arrives.
 */
export const browserTabLabelFromUrl = (url: string): string => {
  if (!url || url === BROWSER_BLANK_URL) return BROWSER_TAB_FALLBACK_TITLE;
  try {
    const parsed = new URL(url);
    return parsed.hostname || BROWSER_TAB_FALLBACK_TITLE;
  } catch {
    return BROWSER_TAB_FALLBACK_TITLE;
  }
};
