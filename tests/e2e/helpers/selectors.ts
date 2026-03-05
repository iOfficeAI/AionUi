/**
 * Reusable selectors for E2E tests.
 *
 * Because the app currently has **no** `data-testid` attributes, we rely on
 * CSS class names, Arco-Design component classes, and text-content matching.
 *
 * When the app adds `data-testid` later, update these selectors in one place.
 */

// ── Generic ──────────────────────────────────────────────────────────────────

/** Chat text input (textarea / contenteditable / textbox). */
export const CHAT_INPUT = 'textarea, [contenteditable="true"], [role="textbox"]';

// ── Settings sidebar (route-based page) ──────────────────────────────────────

export const SETTINGS_SIDER = '.settings-sider';
export const SETTINGS_SIDER_ITEM = '.settings-sider__item';
export const SETTINGS_SIDER_ITEM_LABEL = '.settings-sider__item-label';

// ── Settings modal ───────────────────────────────────────────────────────────

export const SETTINGS_MODAL = '.settings-modal';

// ── Arco Design components ───────────────────────────────────────────────────

export const ARCO_SWITCH = '.arco-switch';
export const ARCO_SWITCH_CHECKED = '.arco-switch-checked';
export const ARCO_COLLAPSE_ITEM = '.arco-collapse-item';
export const ARCO_COLLAPSE_HEADER = '.arco-collapse-item-header';
export const ARCO_TABS_HEADER_TITLE = '.arco-tabs-header-title';
export const ARCO_MESSAGE_SUCCESS = '.arco-message-success';

// ── Agent pill bar ───────────────────────────────────────────────────────────

/** Match an agent logo by its alt text (e.g. "claude logo"). */
export function agentLogoByBackend(backend: string): string {
  return `img[alt="${backend} logo"]`;
}

// ── Channel list ─────────────────────────────────────────────────────────────

export const CHANNEL_IDS = ['telegram', 'lark', 'dingtalk', 'slack', 'discord'] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];
