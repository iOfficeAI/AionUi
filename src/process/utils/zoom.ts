/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserWindow } from 'electron';

const UI_SCALE_DEFAULT = 1;
const UI_SCALE_MIN = 0.8;
const UI_SCALE_MAX = 1.3;

let currentZoomFactor = UI_SCALE_DEFAULT;

// 将输入的缩放因子限制在允许范围，避免异常值 / Clamp zoom factor into safe range
const clampZoomFactor = (value: number): number => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return UI_SCALE_DEFAULT;
  }
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, value));
};

// 获取当前全局缩放值（供 renderer 查询显示）/ Expose current zoom for renderer state syncing
export const getZoomFactor = (): number => currentZoomFactor;

// 在新建窗口时应用最近一次缩放值 / Apply stored zoom to a newly created window
export const applyZoomToWindow = (win: BrowserWindow): void => {
  win.webContents.setZoomFactor(currentZoomFactor);
};

// 将缩放同步到所有窗口，保持多窗口一致 / Sync zoom factor across all BrowserWindows
const updateAllWindowsZoom = (factor: number): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.setZoomFactor(factor);
  }
};

// 设置绝对缩放值，记录并广播给所有窗口 / Persist new zoom factor and broadcast to windows
export const setZoomFactor = (factor: number): number => {
  const clamped = clampZoomFactor(factor);
  currentZoomFactor = clamped;
  updateAllWindowsZoom(clamped);
  return clamped;
};

// 在当前值基础上增量调整缩放 / Adjust zoom by delta relative to current factor
export const adjustZoomFactor = (delta: number): number => {
  return setZoomFactor(currentZoomFactor + delta);
};
