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

/** Match a settings sider item by logical tab ID (builtin/extension global id). */
export function settingsSiderItemById(id: string): string {
  return `${SETTINGS_SIDER_ITEM}[data-settings-id="${id}"]`;
}

// ── Settings modal ───────────────────────────────────────────────────────────

export const SETTINGS_MODAL = '.settings-modal';

// ── Arco Design components ───────────────────────────────────────────────────

export const ARCO_SWITCH = '.arco-switch';
export const ARCO_SWITCH_CHECKED = '.arco-switch-checked';
export const ARCO_COLLAPSE_ITEM = '.arco-collapse-item';
export const ARCO_COLLAPSE_HEADER = '.arco-collapse-item-header';
export const ARCO_TABS_HEADER_TITLE = '.arco-tabs-header-title';
export const ARCO_MESSAGE_SUCCESS = '.arco-message-success';

// ── Guid page ───────────────────────────────────────────────────────────────

/** Guid page chat input textarea. */
export const GUID_INPUT = '.guid-input-card-shell textarea';

// ── Mode selector ──────────────────────────────────────────────────────────

/** Mode selector pill (AgentModeSelector compact mode). */
export const MODE_SELECTOR = '[data-testid="mode-selector"]';

/** Match mode dropdown menu item by mode value. */
export function modeMenuItemByValue(value: string): string {
  return `[data-mode-value="${value}"]`;
}

// ── Conversation page ───────────────────────────────────────────────────────

/** Agent status message badge (connecting / session_active / error). */
export const AGENT_STATUS_MESSAGE = '.agent-status-message';

/** AI (left-aligned) text message container. */
export const AI_TEXT_MESSAGE = '[data-testid="message-text-left"]';

/** User (right-aligned) text message container. */
export const USER_TEXT_MESSAGE = '[data-testid="message-text-right"]';

/** Text content element inside a message (works for both user/AI). */
export const MESSAGE_TEXT_CONTENT = '[data-testid="message-text-content"]';

// ── Sidebar ─────────────────────────────────────────────────────────────────

/** New chat trigger button in sidebar (CSS module hash varies). */
export const NEW_CHAT_TRIGGER = 'div[class*="newChatTrigger"]';

// ── Agent pill bar ───────────────────────────────────────────────────────────

/** Match an agent logo by its alt text (e.g. "claude logo"). */
export function agentLogoByBackend(backend: string): string {
  return `img[alt="${backend} logo"]`;
}

/** Stable selector for all agent pills on guid page. */
export const AGENT_PILL = '[data-agent-pill="true"]';

/** Match an agent pill by backend (claude/gemini/...). */
export function agentPillByBackend(backend: string): string {
  return `${AGENT_PILL}[data-agent-backend="${backend}"]`;
}

/** Match currently selected agent pill. */
export const AGENT_PILL_SELECTED = `${AGENT_PILL}[data-agent-selected="true"]`;

/** Model selector button on the guid page. */
export const MODEL_SELECTOR_BTN = 'button.sendbox-model-btn.guid-config-btn';

// ── Channel list ─────────────────────────────────────────────────────────────

export const CHANNEL_IDS = ['telegram', 'lark', 'dingtalk', 'slack', 'discord'] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

/** Match a channel row by channel id. */
export function channelItemById(id: string): string {
  return `[data-channel-id="${id}"]`;
}

/** Match a channel switch by channel id. */
export function channelSwitchById(id: string): string {
  return `[data-channel-switch-for="${id}"]`;
}

/** Match WebUI page tabs by key (`webui` / `channels`). */
export function webuiTabByKey(key: 'webui' | 'channels'): string {
  return `[data-webui-tab="${key}"]`;
}

// ── Assistant Settings ──────────────────────────────────────────────────────

/** Assistant card by ID. */
export function assistantCardById(id: string): string {
  return `[data-testid="assistant-card-${id}"]`;
}

/** Assistant enabled switch by ID. */
export function assistantSwitchById(id: string): string {
  return `[data-testid="switch-enabled-${id}"]`;
}

/** Preset assistant pill by ID on guid page. */
export function presetPillById(id: string): string {
  return `[data-testid="preset-pill-${id}"]`;
}

/** Assistant edit drawer. */
export const ASSISTANT_EDIT_DRAWER = '[data-testid="assistant-edit-drawer"]';

/** Create assistant button. */
export const BTN_CREATE_ASSISTANT = '[data-testid="btn-create-assistant"]';

/** Save assistant button. */
export const BTN_SAVE_ASSISTANT = '[data-testid="btn-save-assistant"]';

/** Delete assistant button. */
export const BTN_DELETE_ASSISTANT = '[data-testid="btn-delete-assistant"]';

/** Skills section in edit drawer. */
export const SKILLS_SECTION = '[data-testid="skills-section"]';

/** Skills indicator on conversation page. */
export const SKILLS_INDICATOR = '[data-testid="skills-indicator"]';

/** Skills indicator count. */
export const SKILLS_INDICATOR_COUNT = '[data-testid="skills-indicator-count"]';

/** Agent badge on conversation page. */
export const AGENT_BADGE = '[data-testid="agent-badge"]';

/** Search toggle button. */
export const BTN_SEARCH_ASSISTANT = '[data-testid="btn-search-toggle"]';

/** Search input field. */
export const INPUT_SEARCH_ASSISTANT = '[data-testid="input-search-assistant"]';

/** Match the duplicate button for an assistant. */
export function assistantDuplicateById(id: string): string {
  return `[data-testid="btn-duplicate-${id}"]`;
}

/** Match the edit button for an assistant. */
export function assistantEditById(id: string): string {
  return `[data-testid="btn-edit-${id}"]`;
}

/** Name input in assistant edit drawer. */
export const INPUT_ASSISTANT_NAME = '[data-testid="input-assistant-name"]';

/** Description input in assistant edit drawer. */
export const INPUT_ASSISTANT_DESC = '[data-testid="input-assistant-desc"]';

/** Main Agent select in assistant edit drawer. */
export const SELECT_ASSISTANT_AGENT = '[data-testid="select-assistant-agent"]';

/** Add Skills button in assistant edit drawer. */
export const BTN_ADD_SKILLS = '[data-testid="btn-add-skills"]';

/** Skills collapse container. */
export const SKILLS_COLLAPSE = '[data-testid="skills-collapse"]';

/** Confirm delete button inside modal. */
export const BTN_CONFIRM_DELETE = '.delete-assistant-modal .arco-btn-status-danger';
