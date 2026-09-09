/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from '@/common/theme/types';
import { configService } from '@/common/config/configService';
import { ipcBridge } from '@/common';
import { resolveActiveTheme } from '@/common/theme/resolveTheme';
import { BUILTIN_THEMES } from '@renderer/theme/builtinThemes';
import { processCustomCss } from './customCssProcessor';
import { tokensToCss } from './tokensToCss';
import { getSystemPrefersDark } from './systemAppearance';

const TOKENS_STYLE_ID = 'theme-tokens';
const DECORATION_STYLE_ID = 'theme-decoration';

function upsertStyle(id: string, css: string | null, root: Document = document): void {
  const existing = root.getElementById(id);
  if (!css) {
    existing?.remove();
    return;
  }
  const el = (existing as HTMLStyleElement | null) ?? root.createElement('style');
  el.id = id;
  el.textContent = css;
  root.head.appendChild(el); // (re)append to keep it last in <head>
}

function isElectronRenderer(): boolean {
  return typeof window !== 'undefined' && Boolean((window as Window & { electronAPI?: unknown }).electronAPI);
}

async function publishThemeToElectron(theme: Theme): Promise<void> {
  if (!isElectronRenderer()) return;
  await ipcBridge.theme.setActive.invoke(theme);
}

/**
 * Write the two appearance attributes as one coupled unit:
 *  - `data-theme` on `<html>` drives our own design tokens
 *  - `arco-theme` on `<body>` drives Arco's color scales and the
 *    `body[arco-theme='dark']` overrides in arco-override.css
 *
 * Both must stay in sync or dark mode splits (our tokens go dark while Arco
 * stays light). `<html>` always exists; `<body>` can be null during early boot
 * (`readyState === 'loading'`). In that case we must NOT silently skip the
 * `arco-theme` write — defer it to DOMContentLoaded so the two attributes still
 * converge once the body is parsed.
 */
function applyAppearanceAttributes(root: Document, appearance: Theme['appearance']): void {
  root.documentElement.setAttribute('data-theme', appearance);
  if (root.body) {
    root.body.setAttribute('arco-theme', appearance);
    return;
  }
  root.addEventListener(
    'DOMContentLoaded',
    () => {
      root.body?.setAttribute('arco-theme', appearance);
    },
    { once: true }
  );
}

function extractBg2Color(theme: Theme): string {
  // Must mirror the actual --bg-2 tokens in styles/themes/default-color-scheme.css,
  // otherwise the PWA caption buttons (colored from theme-color) desync from the titlebar.
  const defaultBg2 = theme.appearance === 'dark' ? '#262626' : '#f2f3f5';
  if (!theme.tokens) return defaultBg2;

  if (typeof theme.tokens === 'object' && theme.tokens !== null) {
    if ('bg-2' in theme.tokens && typeof (theme.tokens as Record<string, string>)['bg-2'] === 'string') {
      return (theme.tokens as Record<string, string>)['bg-2'];
    }
    const appearanceTokens = theme.appearance === 'dark' ? (theme.tokens as any).dark : (theme.tokens as any).light;
    if (appearanceTokens && typeof appearanceTokens['bg-2'] === 'string') {
      return appearanceTokens['bg-2'];
    }
    const rootTokens = (theme.tokens as any).root;
    if (rootTokens && typeof rootTokens['bg-2'] === 'string') {
      return rootTokens['bg-2'];
    }
  }

  return defaultBg2;
}

/**
 * Resolve the color the PWA caption buttons should blend with. Priority:
 * 1. The computed background of the mounted `.app-titlebar` element — captures
 *    custom theme CSS that overrides the titlebar background with !important.
 * 2. The computed --bg-2 token after the stylesheet chain is applied.
 * 3. The theme-derived value (e.g. jsdom tests where no stylesheet is loaded).
 */
function resolveMetaThemeColor(root: Document, theme: Theme): string {
  const bar = root.querySelector<HTMLElement>('.app-titlebar');
  if (bar) {
    try {
      const bg = root.defaultView?.getComputedStyle(bar).backgroundColor ?? '';
      if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
        return bg;
      }
    } catch {
      // ignore — fall through to the token below
    }
  }

  let tokenColor = '';
  try {
    tokenColor = root.defaultView?.getComputedStyle(root.documentElement).getPropertyValue('--bg-2').trim() ?? '';
  } catch {
    // ignore — fall through to the theme-derived fallback below
  }
  if (!tokenColor || tokenColor.startsWith('var(')) {
    return extractBg2Color(theme);
  }
  return tokenColor;
}

/**
 * Synchronize the meta theme-color tag with the titlebar/header background color.
 * This ensures PWA Window Controls Overlay buttons and mobile browser status bars
 * seamlessly blend with the application chrome in both light and dark themes.
 */
function applyMetaThemeColor(root: Document, theme: Theme): void {
  const bg2Color = resolveMetaThemeColor(root, theme);

  // If there is an existing theme-color meta tag, update it
  let meta = root.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (!meta) {
    // Remove media-specific default tags once runtime theme takes control
    const mediaMetas = root.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media]');
    mediaMetas.forEach((el) => el.remove());

    meta = root.createElement('meta');
    meta.name = 'theme-color';
    root.head?.appendChild(meta);
  }
  meta.content = bg2Color;
}

// One-shot observer for boot-time theme application: applyTheme often runs
// before React mounts the titlebar, so the meta theme-color initially falls back
// to the --bg-2 token. When a custom theme CSS overrides the titlebar background
// with !important, re-sync the meta color once the titlebar element appears so
// the PWA caption buttons match the actually-rendered bar.
let titlebarMountObserver: MutationObserver | null = null;
let latestThemeForMetaSync: Theme | null = null;

function syncMetaThemeColorWhenTitlebarMounts(root: Document, theme: Theme): void {
  latestThemeForMetaSync = theme;
  if (titlebarMountObserver || root.querySelector('.app-titlebar')) return;
  if (typeof MutationObserver === 'undefined') return;

  titlebarMountObserver = new MutationObserver(() => {
    if (!root.querySelector('.app-titlebar') || !latestThemeForMetaSync) return;
    applyMetaThemeColor(root, latestThemeForMetaSync);
    titlebarMountObserver?.disconnect();
    titlebarMountObserver = null;
  });
  titlebarMountObserver.observe(root.body ?? root.documentElement, { childList: true, subtree: true });
}

/** Apply a resolved theme to a document. Used by every app-chrome surface. */
export function applyTheme(theme: Theme, root: Document = document): void {
  applyAppearanceAttributes(root, theme.appearance);
  // Tokens first so applyMetaThemeColor can read the computed --bg-2 they define.
  upsertStyle(TOKENS_STYLE_ID, tokensToCss(theme.tokens), root);
  upsertStyle(DECORATION_STYLE_ID, theme.css ? processCustomCss(theme.css) : null, root);
  applyMetaThemeColor(root, theme);
  syncMetaThemeColorWhenTitlebarMounts(root, theme);
}

/** Resolve `activeId` locally, apply, persist, and publish to Electron for cross-window broadcast. */
export async function setActiveTheme(activeId: string): Promise<Theme> {
  const userThemes = (configService.get('theme.userThemes') as Theme[] | undefined) ?? [];
  const resolved = resolveActiveTheme(activeId, [...BUILTIN_THEMES, ...userThemes], getSystemPrefersDark());
  applyTheme(resolved);
  await configService.set('theme.activeId', activeId);
  await publishThemeToElectron(resolved);
  return resolved;
}

/** Seed Electron's cross-window theme relay. WebUI has no Electron surfaces to notify. */
export async function seedElectronTheme(theme: Theme): Promise<void> {
  await publishThemeToElectron(theme);
}
