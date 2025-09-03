import { themeManager } from './manager';
import type { I18nKeyStyle, ThemeTokens } from './types';

function applyStyleToElement(el: HTMLElement, style: I18nKeyStyle, _tokens: ThemeTokens) {
  // Clear any previously applied inline styles from i18n mapper
  clearElementStyles(el);

  // text styles
  if (style.color) {
    el.style.color = style.color;
  } else if (style.colorVar) {
    el.style.color = getComputedStyle(document.body).getPropertyValue(style.colorVar) || '';
  }
  if (style.fontSize) el.style.fontSize = style.fontSize;
  if (style.fontWeight) el.style.fontWeight = String(style.fontWeight);
  if (style.lineHeight) el.style.lineHeight = style.lineHeight;
  if (style.letterSpacing) el.style.letterSpacing = style.letterSpacing;
  if (style.textTransform) el.style.textTransform = style.textTransform;

  // background styles
  if (style.backgroundColor) {
    el.style.backgroundColor = style.backgroundColor;
  } else if (style.backgroundColorVar) {
    el.style.backgroundColor = getComputedStyle(document.body).getPropertyValue(style.backgroundColorVar) || '';
  }
  if (style.backgroundImage) el.style.backgroundImage = style.backgroundImage;

  // border styles
  if (style.borderColor) {
    el.style.borderColor = style.borderColor;
  } else if (style.borderColorVar) {
    el.style.borderColor = getComputedStyle(document.body).getPropertyValue(style.borderColorVar) || '';
  }
  if (style.borderWidth) el.style.borderWidth = style.borderWidth;
  if (style.borderStyle) el.style.borderStyle = style.borderStyle;
  if (style.borderRadius) el.style.borderRadius = style.borderRadius;

  // spacing
  if (style.padding) el.style.padding = style.padding;
  if (style.margin) el.style.margin = style.margin;

  // size
  if (style.width) el.style.width = style.width;
  if (style.height) el.style.height = style.height;
  if (style.minWidth) el.style.minWidth = style.minWidth;
  if (style.minHeight) el.style.minHeight = style.minHeight;
  if (style.maxWidth) el.style.maxWidth = style.maxWidth;
  if (style.maxHeight) el.style.maxHeight = style.maxHeight;

  // display
  if (style.display) el.style.display = style.display;
  if (style.opacity !== undefined) el.style.opacity = String(style.opacity);

  // effects
  if (style.boxShadow) el.style.boxShadow = style.boxShadow;
}

function clearElementStyles(el: HTMLElement) {
  // Remove styles using kebab-case CSS property names
  const props = ['color', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'background-color', 'background-image', 'border-color', 'border-width', 'border-style', 'border-radius', 'padding', 'margin', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'display', 'opacity', 'box-shadow'];

  props.forEach((p) => el.style.removeProperty(p));
}

/**
 * Clear all i18n styles from elements
 */
export function clearAllI18nStyles(root: HTMLElement = document.body) {
  const nodes = root.querySelectorAll<HTMLElement>('[data-i18n-key]');
  nodes.forEach((el) => {
    clearElementStyles(el);
  });
}

/**
 * Apply styles to elements annotated with data-i18n-key
 * Example: <span data-i18n-key="title">Title</span>
 */
export function applyI18nStyles(root: HTMLElement = document.body) {
  const { pack, mode } = themeManager.getCurrent();
  const tokens = (mode === 'dark' ? pack.dark : pack.light) as ThemeTokens;
  const styles = tokens.i18nStyles || {};
  const nodes = root.querySelectorAll<HTMLElement>('[data-i18n-key]');
  nodes.forEach((el) => {
    const key = el.getAttribute('data-i18n-key') || '';
    const style = resolveI18nStyle(styles, key);
    if (style) applyStyleToElement(el, style, tokens);
  });
}

/** register a MutationObserver to auto-apply when DOM updates */
let observer: MutationObserver | null = null;
export function enableI18nStyleObserver(root: HTMLElement = document.body) {
  if (observer) return;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    const raf = (window as any).requestAnimationFrame || ((cb: FrameRequestCallback) => setTimeout(cb as any, 16));
    raf(() => {
      scheduled = false;
      applyI18nStyles(root);
    });
  };
  observer = new MutationObserver(() => schedule());
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-i18n-key'] });
  applyI18nStyles(root);
}

export function disableI18nStyleObserver() {
  if (observer) observer.disconnect();
  observer = null;
}

/**
 * Resolution order: exact > prefix wildcards (a.b.*) > global (*)
 */
export function resolveI18nStyle(all: Record<string, I18nKeyStyle>, key: string): I18nKeyStyle | undefined {
  if (!key) return all['*'];
  if (all[key]) return all[key];
  // prefix wildcards: a.b.c -> try a.b.* then a.*
  const parts = key.split('.');
  for (let i = parts.length - 1; i >= 1; i--) {
    const prefix = parts.slice(0, i).join('.') + '.*';
    if (all[prefix]) return all[prefix];
  }
  return all['*'];
}
