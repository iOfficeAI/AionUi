/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent 首次操作应用内浏览器时的一次性提示。
 *
 * 设计约束（来自产品决策）：不阻断、不需要用户确认。用户第一次看到侧边浏览器
 * 自己动起来时会困惑"这是谁在操作"，所以要说一句；但这是预期行为，不该拿弹窗
 * 拦住 Agent 干活。
 *
 * One-time notice shown the first time the agent drives the in-app browser.
 * Product constraint: non-blocking and requiring no confirmation. The first time a
 * user sees the side browser move by itself they wonder who is doing it, so it
 * needs saying — but this is expected behavior and must not block the agent behind
 * a modal.
 */

import { Notification } from '@arco-design/web-react';
import i18next from 'i18next';

/**
 * 提示是否已展示过。用 localStorage 而不是内存标记，是因为"首次"指的是
 * 这台机器上的首次，重启应用后不该再提示一遍。
 *
 * Whether the notice has been shown. Stored in localStorage rather than memory
 * because "first time" means first time on this machine — restarting the app must
 * not show it again.
 */
const FIRST_USE_STORAGE_KEY = 'aionui_agent_browser_first_use_notified';

/**
 * 进程内标记，防止同一次会话里连续的工具调用重复弹提示。
 * localStorage 写入是同步的，但读取判断和写入之间仍可能连续触发多次。
 *
 * In-process guard against duplicate notices from back-to-back tool calls within a
 * single session: localStorage writes are synchronous, but several events can still
 * fire between the read and the write.
 */
let notifiedThisSession = false;

const hasNotified = (): boolean => {
  if (notifiedThisSession) return true;
  try {
    return localStorage.getItem(FIRST_USE_STORAGE_KEY) === '1';
  } catch {
    // localStorage 不可用时宁可不提示，也不要每次都弹
    // If localStorage is unavailable, prefer never notifying over notifying always.
    return true;
  }
};

const rememberNotified = (): void => {
  notifiedThisSession = true;
  try {
    localStorage.setItem(FIRST_USE_STORAGE_KEY, '1');
  } catch {
    // Non-critical: the in-process guard still prevents repeats this session.
  }
};

/**
 * 若尚未提示过，则展示一次性提示。已提示过时为空操作。
 * Shows the one-time notice unless it has already been shown. No-op otherwise.
 */
export const maybeNotifyFirstAgentBrowserUse = (): void => {
  if (hasNotified()) return;
  rememberNotified();

  Notification.info({
    // 直接用 i18next 单例而非 @/renderer/services/i18n：后者在模块加载时就会
    // 初始化 i18n 并订阅 IPC，把这些副作用拖进任何 import 本文件的模块里。
    // Use the i18next singleton rather than @/renderer/services/i18n: the latter
    // initializes i18n and subscribes to IPC at module load, dragging those side
    // effects into anything that imports this file.
    title: i18next.t('preview.browser.agentFirstUseTitle'),
    content: i18next.t('preview.browser.agentFirstUseContent'),
    duration: 8000,
  });
};
