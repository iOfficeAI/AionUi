import { themeManager } from './manager';
import type { AppStyleDefinition, I18nKeyStyle, ThemeTokens } from './types';

type Cleanup = () => void;
const cleanupMap = new WeakMap<HTMLElement, Cleanup>();

function setInlineStyles(el: HTMLElement, style?: I18nKeyStyle) {
  if (!style) return;
  const s = el.style as CSSStyleDeclaration & Record<string, string>;
  const assign = (prop: keyof I18nKeyStyle, cssProp: string, resolver?: (v: string) => string) => {
    const v = style[prop];
    if (v === undefined) return;
    s.setProperty(cssProp, resolver ? resolver(String(v)) : String(v));
  };
  const readVar = (varName?: string): string | undefined => {
    if (!varName) return undefined;
    try {
      const v = getComputedStyle(document.body).getPropertyValue(varName);
      return v ? String(v).trim() : undefined;
    } catch {
      return undefined;
    }
  };
  const assignVarFirst = (varKey: keyof I18nKeyStyle, directKey: keyof I18nKeyStyle, cssProp: string) => {
    const varName = style[varKey] as unknown as string | undefined;
    const varValue = readVar(varName);
    if (varValue !== undefined && varValue !== '') {
      s.setProperty(cssProp, varValue);
      return;
    }
    const directVal = style[directKey];
    if (directVal !== undefined) s.setProperty(cssProp, String(directVal));
  };
  // text
  assignVarFirst('colorVar', 'color', 'color');
  assign('fontSize', 'font-size');
  assign('fontWeight', 'font-weight');
  assign('lineHeight', 'line-height');
  assign('letterSpacing', 'letter-spacing');
  assign('textTransform', 'text-transform');
  // background
  assignVarFirst('backgroundColorVar', 'backgroundColor', 'background-color');
  assign('backgroundImage', 'background-image');
  // border
  assignVarFirst('borderColorVar', 'borderColor', 'border-color');
  assign('borderWidth', 'border-width');
  assign('borderStyle', 'border-style');
  assign('borderRadius', 'border-radius');
  // spacing
  assign('padding', 'padding');
  assign('margin', 'margin');
  // size
  assign('width', 'width');
  assign('height', 'height');
  assign('minWidth', 'min-width');
  assign('minHeight', 'min-height');
  assign('maxWidth', 'max-width');
  assign('maxHeight', 'max-height');
  // display
  assign('display', 'display');
  if (style.opacity !== undefined) s.setProperty('opacity', String(style.opacity));
  // effects
  assign('boxShadow', 'box-shadow');
}

function clearInlineStyles(el: HTMLElement) {
  const props = ['color', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'background-color', 'background-image', 'border-color', 'border-width', 'border-style', 'border-radius', 'padding', 'margin', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'display', 'opacity', 'box-shadow'];
  props.forEach((p) => el.style.removeProperty(p));
}

function hasPersistentActive(el: HTMLElement): boolean {
  const state = (el.getAttribute('data-app-state') || '').toLowerCase();
  if (state === 'active') return true;
  if (el.classList && el.classList.contains('selected')) return true;
  return false;
}

function applyMerged(el: HTMLElement, base: AppStyleDefinition, overlay?: I18nKeyStyle) {
  clearInlineStyles(el);
  // Merge: overlay wins for provided keys
  const merged: I18nKeyStyle = { ...(base as I18nKeyStyle), ...(overlay || {}) };
  setInlineStyles(el, merged);
}

function applyOne(el: HTMLElement, def: AppStyleDefinition, key?: string) {
  // clear previous listeners
  const old = cleanupMap.get(el);
  if (old) old();

  // apply base or persistent active if present
  if (hasPersistentActive(el)) applyMerged(el, def, def.active);
  else applyMerged(el, def);

  // Do not attach interactive listeners on containers that host form controls to avoid IME/input issues
  const keys = key.split(/\s+/);
  const isFormContainer = keys.some((k) => k === 'o-setting-group' || k === 'o-textarea') || !!el.querySelector('input, textarea, select, [contenteditable=true]');

  // listeners for hover/active/focus (skip for form containers)
  const enter = () => {
    if (hasPersistentActive(el)) applyMerged(el, def, def.active);
    else applyMerged(el, def, def.hover);
  };
  const leave = () => {
    if (hasPersistentActive(el)) applyMerged(el, def, def.active);
    else applyMerged(el, def);
  };
  const down = () => {
    applyMerged(el, def, def.active);
  };
  const up = () => {
    if (hasPersistentActive(el)) applyMerged(el, def, def.active);
    else applyMerged(el, def);
  };
  const focus = () => {
    if (hasPersistentActive(el)) applyMerged(el, def, def.active);
    else applyMerged(el, def, def.focus);
  };
  const blur = () => {
    if (hasPersistentActive(el)) applyMerged(el, def, def.active);
    else applyMerged(el, def);
  };

  if (!isFormContainer) {
    // mouse listeners are passive to avoid interfering with input behavior
    el.addEventListener('mouseenter', enter, { passive: true } as AddEventListenerOptions);
    el.addEventListener('mouseleave', leave, { passive: true } as AddEventListenerOptions);
    el.addEventListener('mousedown', down, { passive: true } as AddEventListenerOptions);
    el.addEventListener('mouseup', up, { passive: true } as AddEventListenerOptions);
    // use focusin/focusout (bubble) instead of capture focus/blur to avoid intercepting focus handling
    el.addEventListener('focusin', focus);
    el.addEventListener('focusout', blur);
  }

  cleanupMap.set(el, () => {
    el.removeEventListener('mouseenter', enter as any);
    el.removeEventListener('mouseleave', leave as any);
    el.removeEventListener('mousedown', down as any);
    el.removeEventListener('mouseup', up as any);
    el.removeEventListener('focusin', focus as any);
    el.removeEventListener('focusout', blur as any);
  });
}

export function applyAppStyles(root: HTMLElement = document.body) {
  const { pack, mode } = themeManager.getCurrent();
  const tokens = (mode === 'dark' ? pack.dark : pack.light) as ThemeTokens;
  const app = tokens.appStyles || {};
  const nodes = root.querySelectorAll<HTMLElement>('[data-app-style]');
  nodes.forEach((el) => {
    const keys = el.getAttribute('data-app-style')?.split(/\s+/) || [];

    if (keys.length === 0) {
      // 清除之前的样式
      clearInlineStyles(el);
      const old = cleanupMap.get(el);
      if (old) old();
      cleanupMap.delete(el as any);
      return;
    }

    // 如果只有一个样式键，使用原逻辑
    if (keys.length === 1) {
      const key = keys[0];
      const def = app[key as keyof typeof app];
      if (def) applyOne(el, def as AppStyleDefinition, key);
      else {
        clearInlineStyles(el);
        const old = cleanupMap.get(el);
        if (old) old();
        cleanupMap.delete(el as any);
      }
      return;
    }

    // 多个样式键：合并所有样式定义
    const mergedDef: AppStyleDefinition = {};
    let hasAnyStyle = false;

    keys.forEach((key) => {
      if (key) {
        const def = app[key as keyof typeof app];
        if (def) {
          hasAnyStyle = true;
          // 合并基础样式
          Object.assign(mergedDef, def);

          // 合并伪状态
          if (def.hover) {
            if (!mergedDef.hover) mergedDef.hover = {};
            Object.assign(mergedDef.hover, def.hover);
          }
          if (def.active) {
            if (!mergedDef.active) mergedDef.active = {};
            Object.assign(mergedDef.active, def.active);
          }
          if (def.focus) {
            if (!mergedDef.focus) mergedDef.focus = {};
            Object.assign(mergedDef.focus, def.focus);
          }
        }
      }
    });

    if (hasAnyStyle) {
      applyOne(el, mergedDef, keys.join(' '));
    } else {
      clearInlineStyles(el);
      const old = cleanupMap.get(el);
      if (old) old();
      cleanupMap.delete(el as any);
    }
  });
}

let obs: MutationObserver | null = null;
export function enableAppStyleObserver(root: HTMLElement = document.body) {
  if (obs) return;
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    const raf = (window as any).requestAnimationFrame || ((cb: FrameRequestCallback) => setTimeout(cb as any, 16));
    raf(() => {
      scheduled = false;
      applyAppStyles(root);
    });
  };
  obs = new MutationObserver(() => schedule());
  obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-app-style', 'data-app-state', 'class'] });
  applyAppStyles(root);
}

export function disableAppStyleObserver() {
  if (obs) obs.disconnect();
  obs = null;
}
