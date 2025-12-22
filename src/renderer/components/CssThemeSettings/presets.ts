/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICssTheme } from '@/common/storage';

// 导入预设主题封面图片 / Import preset theme cover images
import defaultThemeCover from '@/renderer/assets/default-theme.png';
import misakaMikotoCover from '@/renderer/assets/misaka-mikoto-theme.png';
import helloKittyCover from '@/renderer/assets/hello-kitty.png';
import retroWindowsCover from '@/renderer/assets/retro-windows.png';

/**
 * 默认主题 ID / Default theme ID
 * 用于标识默认主题（无自定义 CSS）/ Used to identify the default theme (no custom CSS)
 */
export const DEFAULT_THEME_ID = 'default-theme';

/**
 * 预设 CSS 主题列表 / Preset CSS themes list
 * 这些主题是内置的，用户可以直接选择使用 / These themes are built-in and can be directly used by users
 */
export const PRESET_THEMES: ICssTheme[] = [
  {
    id: DEFAULT_THEME_ID,
    name: 'Default',
    isPreset: true,
    cover: defaultThemeCover, // 仅用于预览展示 / Only for preview display
    css: `/* Default Theme - AOU Purple Theme / 默认主题 */
/* 此主题展示了系统默认的颜色变量，您可以基于此进行自定义 */
/* This theme shows the system default color variables, you can customize based on this */

:root {
  /* Primary Colors - 主色调 */
  --color-primary: #165dff;
  --primary: #165dff;
  --color-primary-light-1: #4080ff;
  --color-primary-light-2: #6aa1ff;
  --color-primary-light-3: #94bfff;
  --color-primary-dark-1: #0e42d2;
  --primary-rgb: 22, 93, 255;

  /* Brand Colors - 品牌色 */
  --brand: #7583b2;
  --brand-light: #eff0f6;
  --brand-hover: #b5bcd6;
  --color-brand-fill: #7583b2;
  --color-brand-bg: #eff0f6;

  /* AOU Brand Colors - AOU 品牌色板 */
  --aou-1: #eff0f6;
  --aou-2: #e5e7f0;
  --aou-3: #d1d5e5;
  --aou-4: #b5bcd6;
  --aou-5: #97a0c5;
  --aou-6: #7583b2;
  --aou-7: #596590;
  --aou-8: #3f4868;
  --aou-9: #262c41;
  --aou-10: #0d101c;

  /* Background Colors - 背景色 */
  --color-bg-1: #f7f8fa;
  --bg-1: #f7f8fa;
  --color-bg-2: #f2f3f5;
  --bg-2: #f2f3f5;
  --color-bg-3: #e5e6eb;
  --bg-3: #e5e6eb;
  --color-bg-4: #c9cdd4;
  --bg-4: #c9cdd4;
  --bg-base: #ffffff;
  --bg-5: #adb4c1;
  --bg-6: #86909c;
  --bg-8: #4e5969;
  --bg-9: #1d2129;
  --bg-10: #0c0e12;

  /* Interactive State Colors - 交互状态色 */
  --bg-hover: #f3f4f6;
  --bg-active: #e5e6eb;

  /* Fill Colors - 填充色 */
  --fill: #f7f8fa;
  --color-fill: #f7f8fa;
  --fill-0: #ffffff;
  --fill-white-to-black: #ffffff;
  --dialog-fill-0: #ffffff;
  --inverse: #ffffff;

  /* Text Colors - 文字色 */
  --color-text-1: #1d2129;
  --text-primary: #1d2129;
  --color-text-2: #4e5969;
  --text-secondary: #86909c;
  --color-text-3: #86909c;
  --text-disabled: #c9cdd4;
  --text-0: #000000;
  --text-white: #ffffff;

  /* Border Colors - 边框色 */
  --color-border: #e5e6eb;
  --color-border-1: #e5e6eb;
  --color-border-2: #f2f3f5;
  --border-base: #e5e6eb;
  --border-light: #f2f3f5;
  --border-special: var(--bg-3);

  /* Semantic Colors - 语义色 */
  --success: #00b42a;
  --warning: #ff7d00;
  --danger: #f53f3f;
  --info: #165dff;

  /* Message & UI Component Colors - 消息和组件色 */
  --message-user-bg: #e9efff;
  --message-tips-bg: #f0f4ff;
  --workspace-btn-bg: #eff0f1;
}

/* Dark Mode Overrides - 深色模式覆盖 */
[data-theme='dark'] {
  /* Primary Colors - Dark Mode */
  --color-primary: #4d9fff;
  --primary: #4d9fff;
  --color-primary-light-1: #6aa8ff;
  --color-primary-light-2: #87b7ff;
  --color-primary-light-3: #a4c6ff;
  --color-primary-dark-1: #306acc;
  --primary-rgb: 77, 159, 255;

  /* Brand Colors - Dark Mode */
  --brand: #a1aacb;
  --brand-light: #3d4150;
  --brand-hover: #6a749b;
  --color-brand-fill: #a1aacb;
  --color-brand-bg: #3d4150;

  /* AOU Brand Colors - Dark Mode */
  --aou-1: #2a2a2a;
  --aou-2: #3d4150;
  --aou-3: #525a77;
  --aou-4: #6a749b;
  --aou-5: #838fba;
  --aou-6: #a1aacb;
  --aou-7: #b5bcd6;
  --aou-8: #d1d5e5;
  --aou-9: #e5e7f0;
  --aou-10: #eff0f6;

  /* Background Colors - Dark Mode */
  --color-bg-1: #1a1a1a;
  --bg-1: #1a1a1a;
  --color-bg-2: #262626;
  --bg-2: #262626;
  --color-bg-3: #333333;
  --bg-3: #333333;
  --color-bg-4: #404040;
  --bg-4: #404040;
  --bg-base: #0e0e0e;
  --bg-5: #4d4d4d;
  --bg-6: #5a5a5a;
  --bg-8: #737373;
  --bg-9: #a6a6a6;
  --bg-10: #d9d9d9;

  /* Interactive State Colors - Dark Mode */
  --bg-hover: #1f1f1f;
  --bg-active: #2d2d2d;

  /* Fill Colors - Dark Mode */
  --fill: #1a1a1a;
  --color-fill: #1a1a1a;
  --fill-0: rgba(255, 255, 255, 0.08);
  --fill-white-to-black: #000000;
  --dialog-fill-0: #333333;
  --inverse: #ffffff;

  /* Text Colors - Dark Mode */
  --color-text-1: #e5e5e5;
  --text-primary: #e5e5e5;
  --color-text-2: #a6a6a6;
  --text-secondary: #a6a6a6;
  --color-text-3: #737373;
  --text-disabled: #737373;
  --text-0: #ffffff;
  --text-white: #ffffff;

  /* Border Colors - Dark Mode */
  --color-border: #333333;
  --color-border-1: #333333;
  --color-border-2: #262626;
  --border-base: #333333;
  --border-light: #262626;
  --border-special: #60677e;

  /* Semantic Colors - Dark Mode */
  --success: #23c343;
  --warning: #ff9a2e;
  --danger: #f76560;
  --info: #4d9fff;

  /* Message & UI Component Colors - Dark Mode */
  --message-user-bg: #1e2a3a;
  --message-tips-bg: #1a2333;
  --workspace-btn-bg: #1f1f1f;
}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'misaka-mikoto-theme',
    name: 'Misaka Mikoto Theme',
    isPreset: true,
    cover: misakaMikotoCover,
    css: `
/* Misaka Mikoto Theme - 御坂美琴主题 (优化版) */
/* 参考《科学超电磁炮》配色风格 */

:root {
  /* ========== 核心颜色变量 ========== */
  /* 主色调 - Tokiwadai Blue & Electric Blue */
  --color-primary-base: #1e3a8a;
  --color-primary: var(--color-primary-base);
  --primary: var(--color-primary-base);
  --color-primary-light-1: #3b82f6;
  --color-primary-light-2: #60a5fa;
  --color-primary-light-3: #93c5fd;
  --color-primary-dark-1: #1e40af;
  --primary-rgb: 30, 58, 138;

  /* 品牌色 - 使用变量引用减少重复 */
  --brand: var(--color-primary-base);
  --brand-light: #dbeafe;
  --brand-hover: var(--color-primary-light-1);
  --color-brand-fill: var(--color-primary-base);
  --color-brand-bg: #dbeafe;

  /* AOU 品牌色板 - 蓝色系渐变（常盘台校服色） */
  --aou-1: #eff6ff;
  --aou-2: #dbeafe;
  --aou-3: #bfdbfe;
  --aou-4: #93c5fd;
  --aou-5: #60a5fa;
  --aou-6: #3b82f6;
  --aou-7: #2563eb;
  --aou-8: #1e40af;
  --aou-9: #1e3a8a;
  --aou-10: #172554;

  /* 背景色 - 完整定义以兼容所有组件 */
  --bg-base-color: #f0f9ff;
  --bg-base: #ffffff;
  --bg-1: var(--bg-base-color);
  --bg-2: #ffffff;
  --bg-3: #e0f2fe;
  --bg-4: #bae6fd;
  --bg-5: #93c5fd;
  --bg-6: #60a5fa;
  --bg-8: #3b82f6;
  --bg-9: #1e3a8a;
  --bg-10: #172554;
  --color-bg-1: var(--bg-base-color);
  --color-bg-2: #ffffff;
  --color-bg-3: #e0f2fe;
  --color-bg-4: #bae6fd;
  --bg-hover: #e0f2fe;
  --bg-active: #bae6fd;
  --fill: var(--bg-base-color);
  --color-fill: var(--bg-base-color);
  --fill-0: #ffffff;
  --fill-white-to-black: #ffffff;
  --color-fill-2: #e0f2fe;
  --color-fill-3: #bae6fd;

  /* 文字色 - 完整定义 */
  --text-base-color: #1e293b;
  --text-0: #000000;
  --text-primary: var(--text-base-color);
  --text-secondary: #475569;
  --text-disabled: #94a3b8;
  --text-white: #ffffff;
  --color-text-1: var(--text-base-color);
  --color-text-2: #475569;
  --color-text-3: #94a3b8;
  --color-text-4: #cbd5e1;

  /* 边框色 - 完整定义 */
  --border-base-color: #93c5fd;
  --border-base: var(--border-base-color);
  --border-light: #bfdbfe;
  --border-special: #93c5fd;
  --color-border: var(--border-base-color);
  --color-border-1: var(--border-base-color);
  --color-border-2: #bfdbfe;
  --color-border-3: #dbeafe;
  --color-border-4: #eff6ff;

  /* 语义色 */
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: var(--color-primary-light-1);

  /* 消息背景色 */
  --message-user-bg: #dbeafe;
  --message-tips-bg: var(--bg-base-color);
  --workspace-btn-bg: #e0f2fe;

  /* 对话框颜色 */
  --dialog-fill-0: rgba(255, 255, 255, 0.9);

  /* ========== 动画变量 ========== */
  --transition-duration: 0.3s;
  --transition-timing: ease;

  /* ========== 渐变背景 ========== */
  --gradient-primary: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
  --gradient-primary-hover: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
}

/* ========== 全局样式 ========== */
body {
  font-family: "Inter", "SF Pro Display", "Segoe UI", "Microsoft YaHei", sans-serif;
  background-color: var(--bg-1);
}

html {
  background-color: var(--bg-1);
}

/* ========== 布局样式 ========== */
.arco-layout,
[class*="layout"] {
  background-color: var(--bg-1);
}

.arco-layout-content {
  background-color: var(--bg-1);
}

/* ========== 侧边栏 ========== */
.layout-sider {
  background-color: #e0f2fe;
  border-right: 2px solid var(--border-base-color);
  position: relative;
  z-index: 100;
}

.layout-sider-header {
  background: var(--gradient-primary);
  color: white;
  box-shadow: 0 2px 8px rgba(30, 58, 138, 0.3);
}

.layout-sider svg,
.layout-sider-header svg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.9);
  color: rgba(255, 255, 255, 0.9);
  transition: stroke var(--transition-duration) var(--transition-timing);
}

.layout-sider-header svg:hover {
  fill: none;
  stroke: white;
  color: white;
}

/* ========== 图标样式 - 简化选择器 ========== */
/* 全局图标默认颜色 */
.theme-icon svg,
svg:not([class*="model"] svg):not([class*="Model"] svg) {
  fill: none;
  stroke: var(--color-primary-base);
  color: var(--color-primary-base);
  transition: stroke var(--transition-duration) var(--transition-timing),
              color var(--transition-duration) var(--transition-timing);
}

.theme-icon svg:hover,
svg:not([class*="model"] svg):not([class*="Model"] svg):hover {
  fill: none;
  stroke: var(--color-primary-light-1);
  color: var(--color-primary-light-1);
}

/* 按钮内图标 */
button:not([class*="model"]) svg,
.arco-btn:not([class*="model"]) svg {
  fill: none;
  stroke: var(--color-primary-base);
  color: var(--color-primary-base);
  transition: stroke var(--transition-duration) var(--transition-timing);
}

button:not([class*="model"]) svg:hover,
.arco-btn:not([class*="model"]) svg:hover {
  fill: none;
  stroke: var(--color-primary-light-1);
  color: var(--color-primary-light-1);
}

/* 主要按钮内的图标为白色 */
.arco-btn-primary svg {
  stroke: white;
  color: white;
}

/* ========== 背景图片设置 ========== */
.layout-content.bg-1 {
  background-color: var(--bg-1);
  position: relative;
}

/* 半透明遮罩层 */
.layout-content.bg-1::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(240, 249, 255, 0.75) 0%,
    rgba(224, 242, 254, 0.8) 50%,
    rgba(240, 249, 255, 0.75) 100%
  );
  z-index: 0;
  pointer-events: none;
}

/* 聊天页面背景图 */
.chat-layout-header,
[class*="chat-layout"] .arco-layout-content,
[class*="conversation"] .arco-layout-content {
  position: relative;
}

[class*="chat-layout"] .arco-layout-content::before,
[class*="conversation"] .arco-layout-content::before {
  content: "";
  position: absolute;
  inset: 0;
  background: transparent;
  opacity: 0;
  z-index: 0;
  pointer-events: none;
}

/* 确保内容在背景之上 */
.layout-content.bg-1 > *,
[class*="chat-layout"] .arco-layout-content > *,
[class*="conversation"] .arco-layout-content > * {
  position: relative;
  z-index: 1;
}

/* ========== 输入框和发送框 ========== */
.guidLayout,
[class*="guid"] {
  position: relative;
  z-index: 10;
}

.guidInputCard {
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 2px solid var(--border-base-color);
  border-radius: 16px;
  box-shadow: 0 2px 20px rgba(30, 58, 138, 0.1);
}

.guidInputCard textarea,
[class*="guidInputCard"] textarea {
  background-color: rgba(255, 255, 255, 0.98);
  color: var(--color-text-1);
}

/* 发送框样式 */
.sendbox-container:not([class*="model"]):not([class*="Model"]),
[class*="sendbox"]:not([class*="input"]):not([class*="textarea"]):not([class*="model"]):not([class*="Model"]):not([class*="tools"]) {
  border-radius: 16px;
  border: 2px solid var(--border-base-color);
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 20px rgba(30, 58, 138, 0.15);
  transition: all var(--transition-duration) var(--transition-timing);
}

.sendbox-container textarea,
[class*="sendbox"] textarea {
  border: none;
  background: transparent;
}

.sendbox-container:focus-within,
[class*="sendbox"]:focus-within {
  border-color: var(--color-primary-light-1);
  box-shadow: 0 6px 24px rgba(59, 130, 246, 0.3);
}

.sendbox-container svg:not([class*="model"] svg),
[class*="sendbox"]:not([class*="model"]) svg {
  fill: none;
  stroke: var(--color-primary-base);
  color: var(--color-primary-base);
  transition: stroke var(--transition-duration) var(--transition-timing);
}

.sendbox-container svg:not([class*="model"] svg):hover,
[class*="sendbox"]:not([class*="model"]) svg:hover {
  fill: none;
  stroke: var(--color-primary-light-1);
  color: var(--color-primary-light-1);
  transform: scale(1.1);
}

/* ========== 消息气泡 ========== */
.message-item.user .message-bubble,
[class*="message"][class*="user"] .message-content {
  background: var(--gradient-primary);
  color: white;
  border-radius: 16px 16px 4px 16px;
  border: none;
  box-shadow: 0 4px 12px rgba(30, 58, 138, 0.3);
  padding: 12px 16px;
}

.message-item.ai .message-bubble,
[class*="message"][class*="ai"] .message-content,
[class*="message"][class*="assistant"] .message-content {
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 2px solid #bfdbfe;
  border-radius: 16px 16px 16px 4px;
  box-shadow: 0 4px 16px rgba(30, 58, 138, 0.15);
  padding: 12px 16px;
}

/* 工具调用相关样式 */
.message-item.ai .arco-alert,
[class*="message"][class*="ai"] .arco-alert,
[class*="message"][class*="assistant"] .arco-alert,
.message-item.ai [class*="alert"],
[class*="message"][class*="ai"] [class*="alert"],
[class*="message"][class*="assistant"] [class*="alert"] {
  background-color: rgba(255, 255, 255, 0.6);
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  margin: 4px 0;
}

.message-item.ai .arco-card,
[class*="message"][class*="ai"] .arco-card,
[class*="message"][class*="assistant"] .arco-card,
.message-item.ai [class*="card"],
[class*="message"][class*="ai"] [class*="card"],
[class*="message"][class*="assistant"] [class*="card"] {
  background-color: rgba(255, 255, 255, 0.6);
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  margin: 4px 0;
}

.message-item.ai [class*="status"]:not([class*="message"]):not([class*="bubble"]),
[class*="message"][class*="ai"] [class*="status"]:not([class*="message"]):not([class*="bubble"]) {
  background-color: rgba(255, 255, 255, 0.8);
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 2px 6px;
}

/* ========== 按钮样式 ========== */
.arco-btn-primary:not([class*="icon"]):not([class*="circle"]):not([class*="model"]),
button[type="primary"]:not([class*="icon"]):not([class*="circle"]):not([class*="model"]) {
  background: var(--gradient-primary);
  border-color: var(--color-primary-base);
  border-radius: 12px;
  font-weight: 600;
  color: white;
  transition: all var(--transition-duration) var(--transition-timing);
}

.arco-btn-primary:hover:not([class*="icon"]):not([class*="circle"]):not([class*="model"]),
button[type="primary"]:hover:not([class*="icon"]):not([class*="circle"]):not([class*="model"]) {
  background: var(--gradient-primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
}

.arco-btn-secondary:not([class*="model"]) svg,
button[type="secondary"]:not([class*="model"]) svg {
  fill: none;
  stroke: var(--color-primary-base);
  color: var(--color-primary-base);
}

.arco-btn-secondary:not([class*="model"]) svg:hover,
button[type="secondary"]:not([class*="model"]) svg:hover {
  fill: none;
  stroke: var(--color-primary-light-1);
  color: var(--color-primary-light-1);
}

/* ========== 滚动条 ========== */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
  transition: background var(--transition-duration) var(--transition-timing);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--gradient-primary-hover);
}

*:hover::-webkit-scrollbar-thumb {
  background: rgba(59, 130, 246, 0.3);
}

*:hover::-webkit-scrollbar-thumb:hover {
  background: var(--gradient-primary-hover);
}

::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

/* ========== 选中和链接 ========== */
::selection {
  background-color: var(--color-primary-light-1);
  color: white;
}

a:not([class*="button"]):not([class*="btn"]) {
  color: var(--color-primary-base);
  transition: color var(--transition-duration) var(--transition-timing);
}

a:hover:not([class*="button"]):not([class*="btn"]) {
  color: var(--color-primary-light-1);
  text-decoration: underline;
}

/* ========== Tooltip 和 Popover ========== */
.arco-tooltip-popup,
.arco-popover-popup {
  pointer-events: none;
}

.arco-tooltip-inner,
.arco-popover-inner,
.arco-popover-content {
  background-color: var(--color-primary-base);
  color: #ffffff;
  border: 1px solid var(--color-primary-dark-1);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(30, 58, 138, 0.4);
}

.arco-tooltip-inner *,
.arco-popover-inner *,
.arco-popover-content * {
  color: #ffffff;
}

.arco-tooltip-arrow,
.arco-popover-arrow {
  border-color: var(--color-primary-dark-1);
}

/* ========== 对话框 ========== */
.arco-modal-body {
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
}

.arco-modal-header {
  background: var(--gradient-primary);
  color: white;
  border-bottom: 1px solid var(--color-primary-dark-1);
}

.arco-modal-footer {
  background-color: rgba(255, 255, 255, 0.8);
  border-top: 1px solid var(--border-base-color);
}

/* ========================================================= */
/* ==================== 深色模式 Dark Mode ================= */
/* ========================================================= */

[data-theme='dark'] {
  /* 主色调 */
  --color-primary-base: #60a5fa;
  --color-primary: var(--color-primary-base);
  --primary: var(--color-primary-base);
  --color-primary-light-1: #93c5fd;
  --color-primary-light-2: #bfdbfe;
  --color-primary-light-3: #dbeafe;
  --color-primary-dark-1: #3b82f6;
  --primary-rgb: 96, 165, 250;

  /* 品牌色 */
  --brand: var(--color-primary-base);
  --brand-light: #1e3a5a;
  --brand-hover: var(--color-primary-light-1);
  --color-brand-fill: var(--color-primary-base);
  --color-brand-bg: #1e3a5a;

  /* AOU 品牌色板 */
  --aou-1: #0f1729;
  --aou-2: #1e2a47;
  --aou-3: #1e3a5a;
  --aou-4: #2d4a6f;
  --aou-5: #3d5a8f;
  --aou-6: #60a5fa;
  --aou-7: #93c5fd;
  --aou-8: #bfdbfe;
  --aou-9: #dbeafe;
  --aou-10: #eff6ff;

  /* 背景色 */
  --bg-base-color: #0f1729;
  --color-bg-1: var(--bg-base-color);
  --bg-1: var(--bg-base-color);
  --color-bg-2: #1a2332;
  --bg-2: #1a2332;
  --color-bg-3: #1e3a5a;
  --bg-3: #1e3a5a;
  --color-bg-4: #2d4a6f;
  --bg-4: #2d4a6f;
  --bg-base: #0a0f1a;
  --bg-hover: #1a2332;
  --bg-active: #1e3a5a;
  --fill: var(--bg-base-color);
  --color-fill: var(--bg-base-color);

  /* 文字色 */
  --text-base-color: #e0f2fe;
  --color-text-1: var(--text-base-color);
  --text-primary: var(--text-base-color);
  --color-text-2: #bfdbfe;
  --text-secondary: #bfdbfe;
  --color-text-3: #93c5fd;
  --text-disabled: #93c5fd;
  --text-0: #ffffff;

  /* 边框色 */
  --border-base-color: #3d5a8f;
  --color-border: var(--border-base-color);
  --color-border-1: var(--border-base-color);
  --color-border-2: #2d4a6f;
  --border-base: var(--border-base-color);
  --border-light: #2d4a6f;

  /* 语义色 */
  --success: #34d399;
  --warning: #fbbf24;
  --danger: #f87171;
  --info: var(--color-primary-base);

  /* 消息背景色 */
  --message-user-bg: #2d4a6f;
  --message-tips-bg: #1e3a5a;
  --workspace-btn-bg: #1a2332;

  /* 对话框颜色 */
  --dialog-fill-0: rgba(15, 23, 41, 0.95);

  /* 渐变 */
  --gradient-primary: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  --gradient-primary-hover: linear-gradient(135deg, #60a5fa 0%, #93c5fd 100%);
}

/* 深色模式侧边栏 */
[data-theme='dark'] .layout-sider {
  background: linear-gradient(180deg, #1e3a5a 0%, #1a2332 100%);
  border-right: 3px solid var(--color-primary-base);
  box-shadow: 4px 0 20px rgba(96, 165, 250, 0.2);
}

[data-theme='dark'] .layout-sider-header {
  background: var(--gradient-primary);
  box-shadow: 0 4px 12px rgba(96, 165, 250, 0.4);
  border-bottom: 2px solid rgba(255, 255, 255, 0.2);
}

/* 深色模式图标 */
[data-theme='dark'] svg:not([class*="model"] svg),
[data-theme='dark'] .theme-icon svg {
  stroke: var(--color-primary-base);
  color: var(--color-primary-base);
}

[data-theme='dark'] svg:not([class*="model"] svg):hover,
[data-theme='dark'] .theme-icon svg:hover {
  stroke: var(--color-primary-light-1);
  color: var(--color-primary-light-1);
  filter: drop-shadow(0 0 8px rgba(147, 197, 253, 0.6));
}

[data-theme='dark'] button:not([class*="model"]) svg,
[data-theme='dark'] .arco-btn:not([class*="model"]) svg {
  stroke: var(--color-primary-base);
  color: var(--color-primary-base);
}

[data-theme='dark'] button:not([class*="model"]) svg:hover,
[data-theme='dark'] .arco-btn:not([class*="model"]) svg:hover {
  stroke: var(--color-primary-light-1);
  color: var(--color-primary-light-1);
  filter: drop-shadow(0 0 8px rgba(147, 197, 253, 0.6));
}

/* 深色模式背景图 */
[data-theme='dark'] .layout-content.bg-1::before {
  background: linear-gradient(135deg, rgba(15, 23, 41, 0.8) 0%, rgba(30, 58, 90, 0.85) 50%, rgba(15, 23, 41, 0.8) 100%);
}

[data-theme='dark'] [class*="chat-layout"] .arco-layout-content::before,
[data-theme='dark'] [class*="conversation"] .arco-layout-content::before {
  opacity: 0.2;
  filter: brightness(1.1) saturate(1.3) hue-rotate(-10deg);
}

/* 深色模式输入框 */
[data-theme='dark'] .guidInputCard {
  background: linear-gradient(135deg, rgba(30, 58, 90, 0.9) 0%, rgba(45, 74, 111, 0.9) 100%);
  border: 3px solid var(--color-primary-base);
  box-shadow: 0 8px 32px rgba(96, 165, 250, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .guidInputCard textarea,
[data-theme='dark'] [class*="guidInputCard"] textarea {
  background-color: rgba(30, 58, 90, 0.8);
  color: var(--color-text-1);
}

[data-theme='dark'] .sendbox-container:not([class*="model"]),
[data-theme='dark'] [class*="sendbox"]:not([class*="input"]):not([class*="textarea"]):not([class*="model"]):not([class*="tools"]) {
  border: 3px solid var(--color-primary-base);
  background: linear-gradient(135deg, rgba(30, 58, 90, 0.85) 0%, rgba(45, 74, 111, 0.85) 100%);
  box-shadow: 0 8px 24px rgba(96, 165, 250, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .sendbox-container:focus-within,
[data-theme='dark'] [class*="sendbox"]:focus-within {
  border-color: var(--color-primary-light-1);
  box-shadow: 0 8px 32px rgba(147, 197, 253, 0.5), 0 0 20px rgba(96, 165, 250, 0.4);
  transform: translateY(-2px);
}

[data-theme='dark'] .sendbox-container svg:not([class*="model"] svg),
[data-theme='dark'] [class*="sendbox"]:not([class*="model"]) svg {
  stroke: var(--color-primary-base);
  color: var(--color-primary-base);
}

[data-theme='dark'] .sendbox-container svg:not([class*="model"] svg):hover,
[data-theme='dark'] [class*="sendbox"]:not([class*="model"]) svg:hover {
  stroke: var(--color-primary-light-1);
  color: var(--color-primary-light-1);
  filter: drop-shadow(0 0 8px rgba(147, 197, 253, 0.8));
}

/* 深色模式消息气泡 */
[data-theme='dark'] .message-item.user .message-bubble,
[data-theme='dark'] [class*="message"][class*="user"] .message-content {
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #93c5fd 100%);
  box-shadow: 0 6px 20px rgba(96, 165, 250, 0.5), 0 0 0 2px rgba(147, 197, 253, 0.3);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

[data-theme='dark'] .message-item.ai .message-bubble,
[data-theme='dark'] [class*="message"][class*="ai"] .message-content,
[data-theme='dark'] [class*="message"][class*="assistant"] .message-content {
  background: linear-gradient(135deg, rgba(30, 58, 90, 0.9) 0%, rgba(45, 74, 111, 0.9) 100%);
  border: 2px solid var(--border-base-color);
  box-shadow: 0 6px 20px rgba(96, 165, 250, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .message-item.ai .arco-alert,
[data-theme='dark'] [class*="message"][class*="ai"] .arco-alert,
[data-theme='dark'] [class*="message"][class*="assistant"] .arco-alert,
[data-theme='dark'] .message-item.ai [class*="alert"],
[data-theme='dark'] [class*="message"][class*="ai"] [class*="alert"],
[data-theme='dark'] [class*="message"][class*="assistant"] [class*="alert"] {
  background-color: rgba(30, 42, 71, 0.7);
  border: 1px solid var(--border-base-color);
}

[data-theme='dark'] .message-item.ai .arco-card,
[data-theme='dark'] [class*="message"][class*="ai"] .arco-card,
[data-theme='dark'] [class*="message"][class*="assistant"] .arco-card,
[data-theme='dark'] .message-item.ai [class*="card"],
[data-theme='dark'] [class*="message"][class*="ai"] [class*="card"],
[data-theme='dark'] [class*="message"][class*="assistant"] [class*="card"] {
  background-color: rgba(30, 42, 71, 0.7);
  border: 1px solid var(--border-base-color);
}

[data-theme='dark'] .message-item.ai [class*="status"]:not([class*="message"]):not([class*="bubble"]),
[data-theme='dark'] [class*="message"][class*="ai"] [class*="status"]:not([class*="message"]):not([class*="bubble"]) {
  background-color: rgba(30, 58, 90, 0.9);
  border: 1px solid var(--border-base-color);
}

/* 深色模式按钮 */
[data-theme='dark'] .arco-btn-primary:not([class*="icon"]):not([class*="circle"]):not([class*="model"]),
[data-theme='dark'] button[type="primary"]:not([class*="icon"]):not([class*="circle"]):not([class*="model"]) {
  background: var(--gradient-primary);
  border-color: var(--color-primary-dark-1);
  box-shadow: 0 4px 12px rgba(96, 165, 250, 0.4);
}

[data-theme='dark'] .arco-btn-primary:hover:not([class*="icon"]):not([class*="circle"]):not([class*="model"]),
[data-theme='dark'] button[type="primary"]:hover:not([class*="icon"]):not([class*="circle"]):not([class*="model"]) {
  background: var(--gradient-primary-hover);
  box-shadow: 0 8px 24px rgba(147, 197, 253, 0.6), 0 0 20px rgba(96, 165, 250, 0.5);
  transform: translateY(-2px);
}

/* 深色模式滚动条 */
[data-theme='dark'] *:hover::-webkit-scrollbar-thumb {
  background: rgba(96, 165, 250, 0.5);
}

[data-theme='dark'] *:hover::-webkit-scrollbar-thumb:hover {
  background: var(--gradient-primary-hover);
  box-shadow: 0 0 8px rgba(96, 165, 250, 0.6);
}

/* 深色模式选中文字 */
[data-theme='dark'] ::selection {
  background-color: var(--color-primary-dark-1);
  text-shadow: 0 0 4px rgba(59, 130, 246, 0.5);
}

/* 深色模式链接 */
[data-theme='dark'] a:not([class*="button"]):not([class*="btn"]) {
  color: var(--color-primary-base);
  text-decoration-color: rgba(96, 165, 250, 0.4);
}

[data-theme='dark'] a:hover:not([class*="button"]):not([class*="btn"]) {
  color: var(--color-primary-light-1);
  text-shadow: 0 0 8px rgba(147, 197, 253, 0.5);
}

/* 深色模式 Tooltip */
[data-theme='dark'] .arco-tooltip-inner,
[data-theme='dark'] .arco-popover-inner,
[data-theme='dark'] .arco-popover-content {
  background: linear-gradient(135deg, #2d4a6f 0%, #1e3a5a 100%);
  color: var(--text-base-color);
  border: 2px solid var(--color-primary-base);
  box-shadow: 0 6px 20px rgba(96, 165, 250, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .arco-tooltip-arrow,
[data-theme='dark'] .arco-popover-arrow {
  border-color: var(--color-primary-base);
}

/* 深色模式对话框 */
[data-theme='dark'] .arco-modal,
[data-theme='dark'] .arco-modal-wrapper {
  color: var(--text-base-color);
}

[data-theme='dark'] .arco-modal-body {
  background: linear-gradient(135deg, rgba(30, 58, 90, 0.98) 0%, rgba(45, 74, 111, 0.98) 100%);
  backdrop-filter: blur(20px);
  color: var(--text-base-color);
}

[data-theme='dark'] .arco-modal-header {
  background: var(--gradient-primary);
  border-bottom: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 2px 8px rgba(96, 165, 250, 0.3);
}

[data-theme='dark'] .arco-modal-footer {
  background: linear-gradient(135deg, rgba(30, 58, 90, 0.98) 0%, rgba(45, 74, 111, 0.98) 100%);
  border-top: 2px solid var(--color-primary-base);
}

/* 深色模式表单 */
[data-theme='dark'] .arco-form-label,
[data-theme='dark'] .arco-form-label-item,
[data-theme='dark'] label {
  color: var(--color-text-2);
}

[data-theme='dark'] .arco-input,
[data-theme='dark'] .arco-textarea,
[data-theme='dark'] .arco-select-view,
[data-theme='dark'] input:not([type="checkbox"]):not([type="radio"]):not([type="button"]),
[data-theme='dark'] textarea {
  background-color: rgba(30, 58, 90, 0.6);
  border: 2px solid var(--color-primary-base);
  color: var(--text-base-color);
}

[data-theme='dark'] .arco-input:hover,
[data-theme='dark'] .arco-textarea:hover,
[data-theme='dark'] input:not([type="checkbox"]):not([type="radio"]):hover,
[data-theme='dark'] textarea:hover {
  background-color: rgba(45, 74, 111, 0.7);
  border-color: var(--color-primary-light-1);
}

[data-theme='dark'] .arco-input:focus,
[data-theme='dark'] .arco-textarea:focus,
[data-theme='dark'] input:not([type="checkbox"]):not([type="radio"]):focus,
[data-theme='dark'] textarea:focus {
  background-color: rgba(45, 74, 111, 0.8);
  border-color: var(--color-primary-light-1);
  box-shadow: 0 0 0 3px rgba(147, 197, 253, 0.3);
}

[data-theme='dark'] .arco-input::placeholder,
[data-theme='dark'] .arco-textarea::placeholder,
[data-theme='dark'] input::placeholder,
[data-theme='dark'] textarea::placeholder {
  color: var(--color-text-3);
  opacity: 0.5;
}

/* 深色模式开关 */
[data-theme='dark'] .arco-switch {
  background-color: var(--border-base-color);
}

[data-theme='dark'] .arco-switch-checked {
  background-color: var(--color-primary-base);
}

/* 深色模式文字 */
[data-theme='dark'] .arco-typography,
[data-theme='dark'] p,
[data-theme='dark'] span:not([class*="icon"]) {
  color: var(--color-text-2);
}

/* 深色模式分割线 */
[data-theme='dark'] .arco-divider {
  border-color: var(--color-primary-base);
  opacity: 0.3;
}
`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'hello-kitty',
    name: 'Hello Kitty',
    isPreset: true,
    cover: helloKittyCover,
    css: `
/* ========================================
   Hello Kitty 主题 - 优化版
   粉色系可爱风格，支持明暗双模式
   ======================================== */

/* ==================== 明亮模式 (Light Mode) ==================== */
:root {
  /* ===== 主色调 - Primary ===== */
  --hk-primary: #ff85a2;
  --hk-primary-light: #ffb7c5;
  --hk-primary-lighter: #ffe4e8;
  --hk-primary-lightest: #fff0f3;
  --hk-primary-dark: #e06b88;
  --hk-primary-darker: #c95a75;
  --hk-primary-rgb: 255, 133, 162;

  /* ===== 品牌色板渐变 ===== */
  --hk-shade-1: #fff0f3;
  --hk-shade-2: #ffe4e8;
  --hk-shade-3: #ffcad4;
  --hk-shade-4: #ffb7c5;
  --hk-shade-5: #ff9db6;
  --hk-shade-6: #ff85a2;
  --hk-shade-7: #e06b88;
  --hk-shade-8: #c95a75;
  --hk-shade-9: #a84a62;
  --hk-shade-10: #8c3d4f;

  /* ===== 背景色 ===== */
  --hk-bg-base: #ffffff;
  --hk-bg-1: #fff0f3;
  --hk-bg-2: #ffffff;
  --hk-bg-3: #ffe4e8;
  --hk-bg-4: #ffb7c5;
  --hk-bg-hover: #ffe4e8;
  --hk-bg-active: #ffcad4;

  /* ===== 文字色 ===== */
  --hk-text-primary: #5a3e45;
  --hk-text-secondary: #8c6b74;
  --hk-text-tertiary: #bfa5ac;
  --hk-text-disabled: #d4c0c6;
  --hk-text-inverse: #ffffff;

  /* ===== 边框色 ===== */
  --hk-border-base: #ffcad4;
  --hk-border-light: #ffe4e8;
  --hk-border-strong: #ffb7c5;

  /* ===== 语义色 ===== */
  --hk-success: #52c41a;
  --hk-warning: #faad14;
  --hk-error: #f5222d;
  --hk-info: #ff85a2;

  /* ===== 阴影 ===== */
  --hk-shadow-sm: 0 2px 8px rgba(255, 133, 162, 0.15);
  --hk-shadow-md: 0 4px 16px rgba(255, 133, 162, 0.2);
  --hk-shadow-lg: 0 8px 24px rgba(255, 133, 162, 0.25);
  --hk-shadow-glow: 0 0 20px rgba(255, 133, 162, 0.3);

  /* ===== 渐变 ===== */
  --hk-gradient-primary: linear-gradient(135deg, #ff85a2 0%, #ff9db6 100%);
  --hk-gradient-light: linear-gradient(135deg, #fff0f3 0%, #ffe4e8 100%);
  --hk-gradient-button: linear-gradient(135deg, #ff85a2 0%, #ffb7c5 100%);

  /* ===== 映射到系统变量 ===== */
  --color-primary: var(--hk-primary);
  --primary: var(--hk-primary);
  --brand: var(--hk-primary);
  --color-bg-1: var(--hk-bg-1);
  --bg-1: var(--hk-bg-1);
  --color-bg-2: var(--hk-bg-2);
  --bg-2: var(--hk-bg-2);
  --color-text-1: var(--hk-text-primary);
  --text-primary: var(--hk-text-primary);
  --color-text-2: var(--hk-text-secondary);
  --text-secondary: var(--hk-text-secondary);
  --color-border: var(--hk-border-base);
  --border-base: var(--hk-border-base);
  --success: var(--hk-success);
  --warning: var(--hk-warning);
  --danger: var(--hk-error);
  --info: var(--hk-info);
}

/* ===== 字体设置 ===== */
body {
  font-family: "Varela Round", "Nunito", "PingFang SC", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ===== 全局背景 ===== */
body,
html {
  background-color: var(--hk-bg-1);
  color: var(--hk-text-primary);
}

.arco-layout,
[class*="layout"] {
  background-color: var(--hk-bg-1);
}

.arco-layout-content {
  background-color: var(--hk-bg-1);
}

/* ===== 背景图设置 ===== */
.layout-content.bg-1 {
  position: relative;
  background-color: var(--hk-bg-1);
}

/* 半透明遮罩层 */
.layout-content.bg-1::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(240, 249, 255, 0.75) 0%,
    rgba(224, 242, 254, 0.8) 50%,
    rgba(240, 249, 255, 0.75) 100%
  );
  z-index: 0;
  pointer-events: none;
}

.layout-content.bg-1 > * {
  position: relative;
  z-index: 1;
}

/* 聊天页面背景 */
[class*="chat-layout"] .arco-layout-content,
[class*="conversation"] .arco-layout-content {
  position: relative;
}

[class*="chat-layout"] .arco-layout-content::before,
[class*="conversation"] .arco-layout-content::before {
  content: "";
  position: absolute;
  inset: 0;
  background: transparent;
  opacity: 0;
  z-index: 0;
  pointer-events: none;
}

[class*="chat-layout"] .arco-layout-content > *,
[class*="conversation"] .arco-layout-content > * {
  position: relative;
  z-index: 1;
}

/* ==================== 侧边栏 Sidebar ==================== */
.layout-sider {
  background-color: var(--hk-bg-1);
  border-right: 2px solid var(--hk-border-strong);
}

.layout-sider-header {
  background: var(--hk-gradient-primary);
  color: var(--hk-text-inverse);
  box-shadow: var(--hk-shadow-sm);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

/* 侧边栏图标 */
.layout-sider-header svg {
  color: rgba(255, 255, 255, 0.9);
  transition: color 0.3s ease, transform 0.2s ease;
}

.layout-sider-header svg:hover {
  color: var(--hk-text-inverse);
  transform: scale(1.1);
}

/* ==================== 输入框 Input ==================== */
/* 首页输入框 */
.guidInputCard {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border: 2px solid var(--hk-border-strong);
  border-radius: 20px;
  box-shadow: var(--hk-shadow-md);
  transition: all 0.3s ease;
}

.guidInputCard:hover {
  border-color: var(--hk-primary);
  box-shadow: var(--hk-shadow-lg);
}

.guidInputCard textarea {
  background-color: transparent;
  color: var(--hk-text-primary);
  border: none;
}

/* 发送框 */
.sendbox-container {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border: 2px solid var(--hk-border-strong);
  border-radius: 24px;
  box-shadow: var(--hk-shadow-md);
  transition: all 0.3s ease;
}

.sendbox-container:focus-within {
  border-color: var(--hk-primary);
  box-shadow: var(--hk-shadow-lg), var(--hk-shadow-glow);
  transform: translateY(-1px);
}

.sendbox-container textarea {
  background: transparent;
  border: none;
  color: var(--hk-text-primary);
}

/* ==================== 消息气泡 Message ==================== */
/* 用户消息 */
.message-item.user .message-bubble,
[class*="message-user"] .message-content {
  background: var(--hk-gradient-primary);
  color: var(--hk-text-inverse);
  border-radius: 20px 20px 4px 20px;
  box-shadow: var(--hk-shadow-md);
  padding: 12px 18px;
  border: none;
}

/* AI 消息 */
.message-item.ai .message-bubble,
.message-item.assistant .message-bubble,
[class*="message-ai"] .message-content,
[class*="message-assistant"] .message-content {
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
  border: 2px solid var(--hk-border-light);
  border-radius: 20px 20px 20px 4px;
  box-shadow: var(--hk-shadow-sm);
  padding: 12px 18px;
  color: var(--hk-text-primary);
}

/* 工具调用提示 - 保持简洁 */
.message-item.ai .arco-alert,
.message-item.assistant .arco-alert {
  background-color: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--hk-border-light);
  border-radius: 8px;
  margin: 8px 0;
}

.message-item.ai .arco-card,
.message-item.assistant .arco-card {
  background-color: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--hk-border-light);
  border-radius: 8px;
  margin: 8px 0;
}

/* ==================== 按钮 Button ==================== */
.arco-btn-primary,
button[type="primary"] {
  background: var(--hk-gradient-button);
  border: none;
  border-radius: 20px;
  color: var(--hk-text-inverse);
  font-weight: 600;
  box-shadow: var(--hk-shadow-sm);
  transition: all 0.3s ease;
}

.arco-btn-primary:hover,
button[type="primary"]:hover {
  background: linear-gradient(135deg, #ff9db6 0%, #ffcad4 100%);
  box-shadow: var(--hk-shadow-md), var(--hk-shadow-glow);
  transform: translateY(-2px);
}

.arco-btn-primary:active,
button[type="primary"]:active {
  transform: translateY(0);
  box-shadow: var(--hk-shadow-sm);
}

.arco-btn-secondary,
button[type="secondary"] {
  background: transparent;
  border: 2px solid var(--hk-primary);
  border-radius: 20px;
  color: var(--hk-primary);
  font-weight: 600;
  transition: all 0.3s ease;
}

.arco-btn-secondary:hover,
button[type="secondary"]:hover {
  background: var(--hk-bg-hover);
  border-color: var(--hk-primary-light);
  color: var(--hk-primary-light);
  transform: translateY(-1px);
}

/* 按钮禁用状态 */
.arco-btn:disabled,
button:disabled {
  background: var(--hk-bg-3);
  color: var(--hk-text-disabled);
  border-color: var(--hk-border-light);
  cursor: not-allowed;
  opacity: 0.6;
}

/* ==================== 图标 Icon ==================== */
/* 基础图标颜色 - 仅针对需要的图标 */
.arco-icon {
  color: var(--hk-primary);
  transition: color 0.3s ease, transform 0.2s ease;
}

.arco-icon:hover {
  color: var(--hk-primary-light);
  transform: scale(1.1);
}

/* 按钮内图标 */
.arco-btn-primary .arco-icon,
button[type="primary"] .arco-icon {
  color: var(--hk-text-inverse);
}

/* ==================== 滚动条 Scrollbar ==================== */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
  transition: background 0.3s ease;
}

*:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 133, 162, 0.3);
}

*:hover::-webkit-scrollbar-thumb:hover {
  background: var(--hk-gradient-primary);
}

/* ==================== 其他元素 ==================== */
/* 链接 */
a {
  color: var(--hk-primary);
  text-decoration: none;
  transition: color 0.3s ease;
}

a:hover {
  color: var(--hk-primary-light);
  text-decoration: underline;
}

/* 选中文本 */
::selection {
  background-color: var(--hk-primary);
  color: var(--hk-text-inverse);
}

/* Tooltip */
.arco-tooltip-inner,
.arco-popover-inner {
  background-color: var(--hk-primary-dark);
  color: var(--hk-text-inverse);
  border: 1px solid var(--hk-primary-darker);
  border-radius: 8px;
  box-shadow: var(--hk-shadow-md);
  font-weight: 500;
}

.arco-tooltip-arrow,
.arco-popover-arrow {
  border-color: var(--hk-primary-dark);
}

/* Modal 对话框 */
.arco-modal-header {
  background: var(--hk-gradient-light);
  border-bottom: 1px solid var(--hk-border-light);
  color: var(--hk-text-primary);
}

.arco-modal-body {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  color: var(--hk-text-primary);
}

.arco-modal-footer {
  background: rgba(255, 255, 255, 0.95);
  border-top: 1px solid var(--hk-border-light);
}

/* ==================== 深色模式 (Dark Mode) ==================== */
[data-theme='dark'] {
  /* ===== 主色调 - 调亮以提高可见度 ===== */
  --hk-primary: #ffb7c5;
  --hk-primary-light: #ffcad4;
  --hk-primary-lighter: #ffe4e8;
  --hk-primary-lightest: #fff0f3;
  --hk-primary-dark: #ff9db6;
  --hk-primary-darker: #ff85a2;
  --hk-primary-rgb: 255, 183, 197;

  /* ===== 品牌色板 - 深色模式反转 ===== */
  --hk-shade-1: #2d1a24;
  --hk-shade-2: #3d2431;
  --hk-shade-3: #4a2f3a;
  --hk-shade-4: #5d3b4a;
  --hk-shade-5: #7a4d5f;
  --hk-shade-6: #ffb7c5;
  --hk-shade-7: #ffcad4;
  --hk-shade-8: #ffe4e8;
  --hk-shade-9: #fff0f3;
  --hk-shade-10: #fff5f7;

  /* ===== 背景色 - 温暖的深粉紫色 ===== */
  --hk-bg-base: #1f1119;
  --hk-bg-1: #2d1a24;
  --hk-bg-2: #3d2431;
  --hk-bg-3: #4a2f3a;
  --hk-bg-4: #5d3b4a;
  --hk-bg-hover: #3d2431;
  --hk-bg-active: #4a2f3a;

  /* ===== 文字色 - 高对比度粉白色 ===== */
  --hk-text-primary: #fff0f3;
  --hk-text-secondary: #ffcad4;
  --hk-text-tertiary: #ff9db6;
  --hk-text-disabled: #8c6b74;
  --hk-text-inverse: #ffffff;

  /* ===== 边框色 ===== */
  --hk-border-base: #7a4d5f;
  --hk-border-light: #5d3b4a;
  --hk-border-strong: #ff9db6;

  /* ===== 语义色 - 深色模式调整 ===== */
  --hk-success: #95de64;
  --hk-warning: #ffc53d;
  --hk-error: #ff7875;
  --hk-info: #ffb7c5;

  /* ===== 阴影 - 增强发光效果 ===== */
  --hk-shadow-sm: 0 2px 12px rgba(255, 183, 197, 0.2);
  --hk-shadow-md: 0 4px 20px rgba(255, 183, 197, 0.3);
  --hk-shadow-lg: 0 8px 32px rgba(255, 183, 197, 0.4);
  --hk-shadow-glow: 0 0 24px rgba(255, 183, 197, 0.4);

  /* ===== 渐变 - 深色模式保持鲜艳 ===== */
  --hk-gradient-primary: linear-gradient(135deg, #ff85a2 0%, #ffb7c5 100%);
  --hk-gradient-light: linear-gradient(135deg, #4a2f3a 0%, #5d3b4a 100%);
  --hk-gradient-button: linear-gradient(135deg, #ff85a2 0%, #ffb7c5 100%);

  /* ===== 重新映射系统变量 ===== */
  --color-primary: var(--hk-primary);
  --primary: var(--hk-primary);
  --brand: var(--hk-primary);
  --color-bg-1: var(--hk-bg-1);
  --bg-1: var(--hk-bg-1);
  --color-bg-2: var(--hk-bg-2);
  --bg-2: var(--hk-bg-2);
  --bg-hover: var(--hk-bg-hover);
  --bg-active: var(--hk-bg-active);
  --color-text-1: var(--hk-text-primary);
  --text-primary: var(--hk-text-primary);
  --color-text-2: var(--hk-text-secondary);
  --text-secondary: var(--hk-text-secondary);
  --color-border: var(--hk-border-base);
  --border-base: var(--hk-border-base);
}

/* ===== 深色模式全局样式 ===== */
[data-theme='dark'] body,
[data-theme='dark'] html {
  background-color: var(--hk-bg-1);
  color: var(--hk-text-primary);
}

/* ===== 深色模式标题栏 ===== */
[data-theme='dark'] .app-titlebar {
  background-color: var(--hk-bg-2);
  border-color: var(--hk-border-base);
}

[data-theme='dark'] .app-titlebar__button {
  color: var(--hk-text-primary);
}

[data-theme='dark'] .app-titlebar__button:hover {
  background-color: var(--hk-bg-hover);
  color: var(--hk-primary);
}

[data-theme='dark'] .app-titlebar__brand {
  color: var(--hk-text-primary);
}

[data-theme='dark'] .arco-layout,
[data-theme='dark'] [class*="layout"] {
  background-color: var(--hk-bg-1);
}

[data-theme='dark'] .arco-layout-content {
  background-color: var(--hk-bg-1);
}

/* ===== 深色模式背景图 ===== */
[data-theme='dark'] .layout-content.bg-1::before {
  background: linear-gradient(
    135deg,
    rgba(45, 26, 36, 0.85) 0%,
    rgba(61, 36, 49, 0.9) 50%,
    rgba(45, 26, 36, 0.85) 100%
  );
}

[data-theme='dark'] [class*="chat-layout"] .arco-layout-content::before,
[data-theme='dark'] [class*="conversation"] .arco-layout-content::before {
  opacity: 0.2;
  filter: brightness(0.9) saturate(1.2);
}

/* ===== 深色模式侧边栏 ===== */
[data-theme='dark'] .layout-sider {
  background: linear-gradient(180deg, #4a2f3a 0%, #3d2431 100%);
  border-right: 2px solid var(--hk-border-strong);
  box-shadow: 4px 0 20px rgba(255, 183, 197, 0.15);
}

[data-theme='dark'] .layout-sider-header {
  background: var(--hk-gradient-primary);
  box-shadow: 0 4px 16px rgba(255, 183, 197, 0.4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
}

/* ===== 深色模式输入框 ===== */
[data-theme='dark'] .guidInputCard {
  background: linear-gradient(135deg, rgba(74, 47, 58, 0.95) 0%, rgba(93, 59, 74, 0.95) 100%);
  backdrop-filter: blur(16px);
  border: 2px solid var(--hk-border-strong);
  box-shadow: var(--hk-shadow-md), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

[data-theme='dark'] .guidInputCard:hover {
  border-color: var(--hk-primary);
  box-shadow: var(--hk-shadow-lg), var(--hk-shadow-glow);
}

[data-theme='dark'] .guidInputCard textarea {
  color: var(--hk-text-primary);
}

[data-theme='dark'] .sendbox-container {
  background: linear-gradient(135deg, rgba(74, 47, 58, 0.95) 0%, rgba(93, 59, 74, 0.95) 100%);
  backdrop-filter: blur(16px);
  border: 2px solid var(--hk-border-strong);
  box-shadow: var(--hk-shadow-md), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

[data-theme='dark'] .sendbox-container:focus-within {
  border-color: var(--hk-primary);
  box-shadow: var(--hk-shadow-lg), var(--hk-shadow-glow);
}

[data-theme='dark'] .sendbox-container textarea {
  color: var(--hk-text-primary);
}

/* ===== 深色模式消息气泡 ===== */
[data-theme='dark'] .message-item.user .message-bubble,
[data-theme='dark'] [class*="message-user"] .message-content {
  background: var(--hk-gradient-primary);
  color: var(--hk-text-inverse);
  box-shadow: var(--hk-shadow-md), 0 0 0 1px rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .message-item.ai .message-bubble,
[data-theme='dark'] .message-item.assistant .message-bubble,
[data-theme='dark'] [class*="message-ai"] .message-content,
[data-theme='dark'] [class*="message-assistant"] .message-content {
  background: linear-gradient(135deg, rgba(74, 47, 58, 0.95) 0%, rgba(93, 59, 74, 0.95) 100%);
  backdrop-filter: blur(10px);
  border: 2px solid var(--hk-border-base);
  box-shadow: var(--hk-shadow-sm), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  color: var(--hk-text-primary);
}

[data-theme='dark'] .message-item.ai .arco-alert,
[data-theme='dark'] .message-item.assistant .arco-alert {
  background-color: rgba(61, 36, 49, 0.8);
  border-color: var(--hk-border-light);
}

[data-theme='dark'] .message-item.ai .arco-card,
[data-theme='dark'] .message-item.assistant .arco-card {
  background-color: rgba(61, 36, 49, 0.8);
  border-color: var(--hk-border-light);
}

/* ===== 深色模式按钮 ===== */
[data-theme='dark'] .arco-btn-primary,
[data-theme='dark'] button[type="primary"] {
  background: var(--hk-gradient-primary);
  box-shadow: var(--hk-shadow-md);
}

[data-theme='dark'] .arco-btn-primary:hover,
[data-theme='dark'] button[type="primary"]:hover {
  background: linear-gradient(135deg, #ffb7c5 0%, #ffcad4 100%);
  box-shadow: var(--hk-shadow-lg), var(--hk-shadow-glow);
}

[data-theme='dark'] .arco-btn-secondary,
[data-theme='dark'] button[type="secondary"] {
  border-color: var(--hk-primary);
  color: var(--hk-primary);
}

[data-theme='dark'] .arco-btn-secondary:hover,
[data-theme='dark'] button[type="secondary"]:hover {
  background: var(--hk-bg-hover);
  border-color: var(--hk-primary-light);
  color: var(--hk-primary-light);
  box-shadow: 0 0 12px rgba(255, 183, 197, 0.3);
}

/* ===== 深色模式图标 ===== */
[data-theme='dark'] .arco-icon {
  color: var(--hk-primary);
}

[data-theme='dark'] .arco-icon:hover {
  color: var(--hk-primary-light);
  filter: drop-shadow(0 0 8px rgba(255, 183, 197, 0.5));
}

/* ===== 深色模式滚动条 ===== */
[data-theme='dark'] *:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 183, 197, 0.4);
}

[data-theme='dark'] *:hover::-webkit-scrollbar-thumb:hover {
  background: var(--hk-gradient-primary);
  box-shadow: 0 0 8px rgba(255, 183, 197, 0.5);
}

/* ===== 深色模式其他元素 ===== */
[data-theme='dark'] a {
  color: var(--hk-primary);
}

[data-theme='dark'] a:hover {
  color: var(--hk-primary-light);
  text-shadow: 0 0 8px rgba(255, 183, 197, 0.4);
}

[data-theme='dark'] ::selection {
  background-color: var(--hk-primary);
  color: var(--hk-text-inverse);
}

[data-theme='dark'] .arco-tooltip-inner,
[data-theme='dark'] .arco-popover-inner {
  background: linear-gradient(135deg, #7a4d5f 0%, #5d3b4a 100%);
  color: var(--hk-text-primary);
  border: 2px solid var(--hk-primary);
  box-shadow: var(--hk-shadow-md), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .arco-tooltip-arrow,
[data-theme='dark'] .arco-popover-arrow {
  border-color: var(--hk-primary);
}

[data-theme='dark'] .arco-modal-header {
  background: var(--hk-gradient-primary);
  color: var(--hk-text-inverse);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

[data-theme='dark'] .arco-modal-body {
  background: linear-gradient(135deg, rgba(61, 36, 49, 0.98) 0%, rgba(74, 47, 58, 0.98) 100%);
  backdrop-filter: blur(20px);
  color: var(--hk-text-primary);
}

[data-theme='dark'] .arco-modal-footer {
  background: linear-gradient(135deg, rgba(61, 36, 49, 0.98) 0%, rgba(74, 47, 58, 0.98) 100%);
  border-top: 1px solid var(--hk-border-base);
}

/* ==================== 动画效果 ==================== */
@keyframes hk-float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

@keyframes hk-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

/* 可选：给某些元素添加悬浮动画 */
.arco-btn-primary:hover {
  animation: hk-float 2s ease-in-out infinite;
}

/* ==================== 响应式调整 ==================== */
@media (max-width: 768px) {
  /* 移动端优化 */
  .guidInputCard,
  .sendbox-container {
    border-radius: 16px;
  }

  .message-item.user .message-bubble,
  .message-item.ai .message-bubble,
  .message-item.assistant .message-bubble {
    border-radius: 16px;
    padding: 10px 14px;
  }

  .arco-btn-primary,
  .arco-btn-secondary {
    border-radius: 16px;
    padding: 8px 16px;
  }
}

/* ==================== 打印样式 ==================== */
@media print {
  /* 打印时移除背景图和阴影 */
  .layout-content.bg-1::before,
  [class*="chat-layout"] .arco-layout-content::before {
    display: none;
  }

  * {
    box-shadow: none !important;
    text-shadow: none !important;
  }
}

`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'retro-windows',
    name: 'Retro Windows',
    isPreset: true,
    cover: retroWindowsCover,
    css: `/* ========================================
   Windows Classic Theme - 优化版
   复古 Windows 配色，支持明暗双模式
   确保可读性，适度添加 Windows 经典元素
   ======================================== */

/* ==================== 明色模式 (Light Mode) ==================== */
/* 核心颜色变量 - 复古 Windows 配色 */
:root {
  /* 主色调 - Classic Windows Blue */
  --color-primary: #0078d4;
  --primary: #0078d4;
  --color-primary-light-1: #1a86d9;
  --color-primary-light-2: #3399e6;
  --color-primary-light-3: #4da6f0;
  --color-primary-dark-1: #005a9e;
  --primary-rgb: 0, 120, 212;
  
  /* 品牌色 - Windows Classic */
  --brand: #0078d4;
  --brand-light: #e6f2fa;
  --brand-hover: #1a86d9;
  --color-brand-fill: #0078d4;
  --color-brand-bg: #e6f2fa;
  
  /* AOU 品牌色板 - 蓝色系渐变 */
  --aou-1: #e6f2fa;
  --aou-2: #cce5f5;
  --aou-3: #b3d8f0;
  --aou-4: #99cbeb;
  --aou-5: #66b1e1;
  --aou-6: #0078d4;
  --aou-7: #005a9e;
  --aou-8: #004578;
  --aou-9: #003052;
  --aou-10: #001b2c;
  
  /* 背景色 - Classic Windows Gray/Beige */
  --color-bg-1: #f0f0f0;
  --bg-1: #f0f0f0;
  --color-bg-2: #ffffff;
  --bg-2: #ffffff;
  --color-bg-3: #e0e0e0;
  --bg-3: #e0e0e0;
  --color-bg-4: #c0c0c0;
  --bg-4: #c0c0c0;
  --bg-base: #ffffff;
  --bg-hover: #e0e0e0;
  --bg-active: #c0c0c0;
  --fill: #f0f0f0;
  --color-fill: #f0f0f0;
  
  /* 文字色 - Classic Windows Text */
  --color-text-1: #000000;
  --text-primary: #000000;
  --color-text-2: #404040;
  --text-secondary: #404040;
  --color-text-3: #808080;
  --text-disabled: #808080;
  --text-0: #000000;
  
  /* 边框色 - Classic Windows Border */
  --color-border: #808080;
  --color-border-1: #808080;
  --color-border-2: #c0c0c0;
  --border-base: #808080;
  --border-light: #c0c0c0;
  
  /* 语义色 - Classic Windows Colors */
  --success: #00a300; /* Windows 绿 */
  --warning: #ff8c00;
  --danger: #d13438;
  --info: #0078d4; /* Windows 蓝 */
  
  /* Windows 经典绿色 - 适度使用 */
  --windows-green: #00a300;
  --windows-green-light: #00c300;
  --windows-green-dark: #008000;
  
  /* 消息背景色 - Message Backgrounds */
  --message-user-bg: #d0e8f5;
  --message-tips-bg: #f0f0f0;
  --workspace-btn-bg: #e0e0e0;
  
  /* 对话框颜色 - Dialog Colors */
  --dialog-fill-0: rgba(255, 255, 255, 0.95);
}

/* 全局字体 - 经典 Windows 字体 */
body {
  font-family: "MS Sans Serif", "Tahoma", "Arial", "Microsoft YaHei", sans-serif;
}

/* 全局背景色 - 经典 Windows 米色 */
body,
html {
  background-color: var(--bg-1, #f0f0f0);
}

/* 全局主要背景区域 */
.arco-layout,
[class*="layout"] {
  background-color: var(--bg-1, #f0f0f0);
}

/* 全局内容区域背景 */
.arco-layout-content {
  background-color: var(--bg-1, #f0f0f0);
}

/* ==================== 侧边栏 Sidebar ==================== */
/* 侧边栏样式 - 只保留基础样式，其他使用系统默认 */
.layout-sider {
  background-color: #e0e0e0;
  border-right: 2px solid #808080;
  position: relative;
  z-index: 100;
}

.layout-sider.collapsed {
  overflow: hidden;
}

.layout-sider.collapsed * {
  overflow: hidden;
}

.layout-sider.collapsed::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

.layout-sider-header {
  background: linear-gradient(180deg, #0078d4 0%, #005a9e 100%);
  color: white;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2);
}

/* 按钮内的图标 - 保持原有样式，不强制设置 */
button:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg,
.arco-btn:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg {
  /* 保持图标原有样式 */
}

/* 主要按钮内的图标 - 保持原有样式 */
.arco-btn-primary:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg {
  /* 保持图标原有样式 */
}

/* ==================== 背景图设置 ==================== */
/* 背景图片设置 - 让背景图穿透显示 */
.layout-content.bg-1 {
  background-color: var(--bg-1, #f0f0f0);
  position: relative;
}

/* 半透明遮罩层 */
.layout-content.bg-1::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(240, 249, 255, 0.75) 0%,
    rgba(224, 242, 254, 0.8) 50%,
    rgba(240, 249, 255, 0.75) 100%
  );
  z-index: 0;
  pointer-events: none;
}
  
/* 聊天页面背景图 - Windows 经典配色 */
.chat-layout-header,
[class*="chat-layout"] .arco-layout-content,
[class*="conversation"] .arco-layout-content {
  position: relative;
}

[class*="chat-layout"] .arco-layout-content::before,
[class*="conversation"] .arco-layout-content::before {
  content: "";
  position: absolute;
  inset: 0;
  background: transparent;
  opacity: 0;
  z-index: 0;
  pointer-events: none;
}

/* 确保聊天内容在背景图之上 */
[class*="chat-layout"] .arco-layout-content > *,
[class*="conversation"] .arco-layout-content > * {
  position: relative;
  z-index: 1;
}

/* 确保内容在遮罩之上 */
.layout-content.bg-1 > * {
  position: relative;
  z-index: 1;
}

/* 首页对话框和输入区域 - 确保完全可见 */
.guidLayout,
[class*="guid"] {
  position: relative;
  z-index: 10;
}

/* 输入框文本域 - 确保文字清晰可见 */
.guidInputCard textarea,
[class*="guidInputCard"] textarea {
  background-color: rgba(255, 255, 255, 0.98);
  color: var(--color-text-1);
}

/* ==================== 输入框 Input ==================== */
/* 发送框样式 - 只针对可见的发送框容器，排除模型选择器等系统组件 */
.sendbox-container:not([class*="model"]):not([class*="Model"]),
[class*="sendbox"]:not([class*="input"]):not([class*="textarea"]):not([class*="model"]):not([class*="Model"]):not([class*="tools"]) {
  border-radius: 4px; /* 经典 Windows 方角 */
  border: 2px outset #c0c0c0; /* 经典 3D 边框效果 */
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(4px);
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.8), inset -1px -1px 0 rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

/* 首页输入框对话框 - 白色90%不透明度，确保用户看得清 */
.guidInputCard {
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(4px);
  border: 2px outset #c0c0c0; /* 经典 3D 边框 */
  border-radius: 4px;
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.8), inset -1px -1px 0 rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 发送框内的文本域 - 保持原有样式，只调整边框 */
.sendbox-container textarea,
[class*="sendbox"] textarea {
  border: none;
  background: transparent;
  color: var(--color-text-1); /* 确保文字清晰 */
}

.sendbox-container:focus-within,
[class*="sendbox"]:focus-within {
  border: 2px inset #808080; /* 聚焦时变为内陷效果 */
  box-shadow: inset 2px 2px 4px rgba(0, 0, 0, 0.2);
}

/* 发送框内图标颜色调整 - 排除模型选择按钮和系统组件 */
.sendbox-container svg:not(.sendbox-model-btn svg):not([class*="model"] svg),
[class*="sendbox"]:not([class*="model"]):not([class*="Model"]) svg:not(.sendbox-model-btn svg) {
  color: #0078d4;
  transition: color 0.3s ease;
}

.sendbox-container svg:not(.sendbox-model-btn svg):not([class*="model"] svg):hover,
[class*="sendbox"]:not([class*="model"]):not([class*="Model"]) svg:not(.sendbox-model-btn svg):hover {
  color: #1a86d9;
  transform: scale(1.1);
}

/* ==================== 消息气泡 Message ==================== */
/* 用户消息气泡 - 经典 Windows 蓝色 */
.message-item.user .message-bubble,
[class*="message"][class*="user"] .message-content {
  background: linear-gradient(180deg, #0078d4 0%, #005a9e 100%);
  color: white;
  border-radius: 4px; /* 方角 */
  border: 1px solid #005a9e;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2);
  padding: 12px 16px;
}

/* AI 消息气泡 - 经典 Windows 白色 */
.message-item.ai .message-bubble,
[class*="message"][class*="ai"] .message-content,
[class*="message"][class*="assistant"] .message-content {
  background-color: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(4px);
  border: 1px solid #c0c0c0;
  border-radius: 4px; /* 方角 */
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.8), inset -1px -1px 0 rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 12px 16px;
  color: var(--color-text-1); /* 确保文字清晰 */
}

/* 工具调用消息 - 保持原有样式，只微调背景色以融入主题 */
.message-item.ai .arco-alert,
[class*="message"][class*="ai"] .arco-alert,
[class*="message"][class*="assistant"] .arco-alert,
.message-item.ai [class*="alert"],
[class*="message"][class*="ai"] [class*="alert"],
[class*="message"][class*="assistant"] [class*="alert"] {
  background-color: rgba(255, 255, 255, 0.9);
  border: 1px solid #c0c0c0;
  border-radius: 4px;
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.8), inset -1px -1px 0 rgba(0, 0, 0, 0.1);
  backdrop-filter: none;
  margin: 4px 0;
  color: var(--color-text-1); /* 确保文字清晰 */
}

/* 工具调用卡片 - 恢复原有样式，微调 */
.message-item.ai .arco-card,
[class*="message"][class*="ai"] .arco-card,
[class*="message"][class*="assistant"] .arco-card,
.message-item.ai [class*="card"],
[class*="message"][class*="ai"] [class*="card"],
[class*="message"][class*="assistant"] [class*="card"] {
  background-color: rgba(255, 255, 255, 0.9);
  border: 1px solid #c0c0c0;
  border-radius: 4px;
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.8), inset -1px -1px 0 rgba(0, 0, 0, 0.1);
  backdrop-filter: none;
  margin: 4px 0;
  color: var(--color-text-1); /* 确保文字清晰 */
}

/* 工具调用相关的内容区域 - 恢复简洁样式 */
.message-item.ai [class*="tool"]:not([class*="message"]):not([class*="bubble"]),
[class*="message"][class*="ai"] [class*="tool"]:not([class*="message"]):not([class*="bubble"]),
.message-item.ai [class*="Tool"]:not([class*="message"]):not([class*="bubble"]),
[class*="message"][class*="ai"] [class*="Tool"]:not([class*="message"]):not([class*="bubble"]),
.message-item.ai [class*="WebFetch"],
[class*="message"][class*="ai"] [class*="WebFetch"],
.message-item.ai [class*="web_search"],
[class*="message"][class*="ai"] [class*="web_search"],
.message-item.ai [class*="exec_command"],
[class*="message"][class*="ai"] [class*="exec_command"],
.message-item.ai [class*="mcp_tool"],
[class*="message"][class*="ai"] [class*="mcp_tool"] {
  background-color: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  margin: 0;
}

/* 工具调用状态标签 - 恢复简洁样式 */
.message-item.ai [class*="status"]:not([class*="message"]):not([class*="bubble"]),
[class*="message"][class*="ai"] [class*="status"]:not([class*="message"]):not([class*="bubble"]),
.message-item.ai [class*="Status"]:not([class*="message"]):not([class*="bubble"]),
[class*="message"][class*="ai"] [class*="Status"]:not([class*="message"]):not([class*="bubble"]) {
  background-color: rgba(255, 255, 255, 0.95);
  border: 1px solid #c0c0c0;
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--color-text-1); /* 确保文字清晰 */
}

/* ==================== 按钮 Button ==================== */
/* 主要按钮样式 - 经典 Windows 3D 按钮效果 */
.arco-btn-primary:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]),
button[type="primary"]:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]) {
  background: linear-gradient(180deg, #0078d4 0%, #005a9e 100%);
  border: 2px outset #0078d4;
  border-radius: 4px; /* 方角 */
  font-weight: normal;
  color: white;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
}

.arco-btn-primary:hover:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]),
button[type="primary"]:hover:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]) {
  background: linear-gradient(180deg, #1a86d9 0%, #0078d4 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 3px 6px rgba(0, 0, 0, 0.3);
}

.arco-btn-primary:active:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]),
button[type="primary"]:active:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]) {
  border: 2px inset #005a9e;
  box-shadow: inset 2px 2px 4px rgba(0, 0, 0, 0.3);
}

/* 成功状态按钮 - Windows 绿（适度使用） */
.arco-btn-success,
button[type="success"] {
  background: linear-gradient(180deg, #00a300 0%, #008000 100%);
  border: 2px outset #00a300;
  border-radius: 4px;
  color: white;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
}

.arco-btn-success:hover,
button[type="success"]:hover {
  background: linear-gradient(180deg, #00c300 0%, #00a300 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 3px 6px rgba(0, 0, 0, 0.3);
}

.arco-btn-success:active,
button[type="success"]:active {
  border: 2px inset #008000;
  box-shadow: inset 2px 2px 4px rgba(0, 0, 0, 0.3);
}

/* Windows 绿点缀 - 用于成功提示、确认按钮等 */
.arco-alert[class*="success"],
[class*="alert"][class*="success"],
.arco-message-success,
[class*="message"][class*="success"] {
  background-color: rgba(0, 163, 0, 0.1);
  border: 1px solid #00a300;
  border-left: 3px solid #00a300;
}

/* 链接 hover 时可以使用 Windows 绿 */
a:not([class*="button"]):not([class*="btn"])[class*="success"],
a:not([class*="button"]):not([class*="btn"])[class*="confirm"] {
  color: #00a300;
}

a:not([class*="button"]):not([class*="btn"])[class*="success"]:hover,
a:not([class*="button"]):not([class*="btn"])[class*="confirm"]:hover {
  color: #00c300;
  text-decoration: underline;
}

/* Windows 绿点缀 - 复选框选中状态 */
.arco-checkbox-checked .arco-checkbox-icon,
input[type="checkbox"]:checked {
  background-color: #00a300;
  border-color: #00a300;
}

.arco-checkbox-checked .arco-checkbox-icon::after {
  border-color: white;
}

/* Windows 绿点缀 - 单选框选中状态 */
.arco-radio-checked .arco-radio-button,
input[type="radio"]:checked {
  border-color: #00a300;
}

.arco-radio-checked .arco-radio-button::after {
  background-color: #00a300;
}

/* Windows 绿点缀 - 进度条成功状态 */
.arco-progress-line[class*="success"],
.arco-progress-line[data-status="success"] {
  background-color: rgba(0, 163, 0, 0.1);
}

.arco-progress-line[class*="success"] .arco-progress-line-inner,
.arco-progress-line[data-status="success"] .arco-progress-line-inner {
  background-color: #00a300;
}

/* Windows 绿点缀 - 标签成功状态 */
.arco-tag[class*="success"],
.arco-tag[data-color="green"] {
  background-color: rgba(0, 163, 0, 0.1);
  border-color: #00a300;
  color: #00a300;
}

/* 明确排除模型选择按钮及其所有子元素，保持系统默认样式 */
.sendbox-model-btn,
[class*="sendbox-model"],
.sendbox-model-btn *,
[class*="sendbox-model"] * {
  /* 重置所有可能被影响的样式 */
  color: inherit;
  fill: inherit;
  background: inherit;
  border: inherit;
  border-radius: inherit;
  box-shadow: inherit;
  transform: none;
}

/* 排除发送框工具区域（包含模型选择器） */
.sendbox-tools,
[class*="sendbox-tools"],
.sendbox-tools *,
[class*="sendbox-tools"] * {
  color: inherit;
  fill: inherit;
  background: inherit;
  border: inherit;
  border-radius: inherit;
  box-shadow: inherit;
  transform: none;
}

/* ==================== 滚动条 Scrollbar ==================== */
/* 滚动条美化 - 经典 Windows 滚动条样式 */
::-webkit-scrollbar {
  width: 16px;
  height: 16px;
}

::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #c0c0c0 0%, #808080 100%);
  border: 1px solid #808080;
  border-radius: 0; /* 方角 */
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.5), inset -1px -1px 0 rgba(0, 0, 0, 0.2);
  transition: background 0.2s ease;
}

::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #d0d0d0 0%, #909090 100%);
}

/* 当容器hover时，滚动条也显示 */
*:hover::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #c0c0c0 0%, #808080 100%);
}

*:hover::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #d0d0d0 0%, #909090 100%);
}

::-webkit-scrollbar-track {
  background: #f0f0f0;
  border: 1px solid #808080;
  border-radius: 0; /* 方角 */
  box-shadow: inset 1px 1px 0 rgba(0, 0, 0, 0.1);
}

::-webkit-scrollbar-button {
  background: #c0c0c0;
  border: 1px solid #808080;
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.5), inset -1px -1px 0 rgba(0, 0, 0, 0.2);
}

::-webkit-scrollbar-button:hover {
  background: #d0d0d0;
}

/* ==================== 其他元素 ==================== */
/* 选中文字 */
::selection {
  background-color: #0078d4;
  color: white;
}

/* 链接样式 */
a:not([class*="button"]):not([class*="btn"]) {
  color: #0078d4;
  transition: color 0.2s ease;
}

a:hover:not([class*="button"]):not([class*="btn"]) {
  color: #005a9e;
  text-decoration: underline;
}

/* 次要按钮图标颜色 - 排除模型选择器 */
.arco-btn-secondary:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg,
button[type="secondary"]:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg {
  color: #0078d4;
  transition: color 0.2s ease;
}

.arco-btn-secondary:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover,
button[type="secondary"]:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover {
  color: #1a86d9;
}

/* 消息区域图标颜色 - 只针对消息气泡内的图标 */
.message-item .message-content svg,
[class*="message"] [class*="content"] svg {
  color: #404040;
  transition: color 0.2s ease;
}

.message-item:hover .message-content svg,
[class*="message"]:hover [class*="content"] svg {
  color: #0078d4;
}

/* ==================== Tooltip 和 Popover ==================== */
/* Tooltip 和 Popover 样式优化 - 经典 Windows 灰色背景，黑色文字 */
.arco-tooltip-popup,
.arco-popover-popup {
  pointer-events: none; /* 避免遮挡鼠标事件 */
  z-index: 10000 !important; /* 确保 tooltip 在最上层 */
}

/* 内部容器样式 */
.arco-tooltip-inner,
.arco-popover-inner,
.arco-popover-content {
  background-color: #ffffe1 !important; /* 经典 Windows 米黄色 */
  color: #000000 !important; /* 黑色文字 */
  border: 1px solid #808080 !important;
  border-radius: 0 !important; /* 方角 */
  box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3) !important;
  backdrop-filter: none !important;
  padding: 4px 8px !important;
  font-size: 12px !important;
  line-height: 1.4 !important;
  max-width: 200px !important;
  word-wrap: break-word !important;
}

/* 强制内部文字颜色为黑色 */
.arco-tooltip-inner *,
.arco-popover-inner *,
.arco-popover-content * {
  color: #000000 !important;
  background-color: transparent !important;
}

/* 箭头样式 */
.arco-tooltip-arrow,
.arco-popover-arrow {
  border-color: #808080 !important;
}

/* 侧边栏 tooltip - 使用系统默认配色 */
.layout-sider ~ .arco-tooltip-popup,
.layout-sider .arco-tooltip-popup {
  z-index: 10001 !important;
}

/* ==================== 对话框 Modal ==================== */
/* 对话框背景和透明度 */
.arco-modal-body {
  background-color: rgba(240, 240, 240, 0.98);
  backdrop-filter: blur(4px);
  border: 2px outset #c0c0c0;
  color: var(--color-text-1); /* 确保文字清晰 */
}

.arco-modal-header {
  background: linear-gradient(180deg, #0078d4 0%, #005a9e 100%);
  color: white;
  border-bottom: 1px solid #005a9e;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.arco-modal-footer {
  background-color: rgba(240, 240, 240, 0.98);
  border-top: 1px solid #c0c0c0;
  color: var(--color-text-1); /* 确保文字清晰 */
}

/* ==================== Windows 经典元素（适度添加） ==================== */
/* 经典输入框 - Windows 95/98 风格 */
.arco-input,
input[type="text"],
input[type="password"],
input[type="email"],
input[type="number"],
input[type="search"] {
  background-color: var(--bg-2);
  border: 2px inset var(--border-base);
  box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.2);
  border-radius: 0;
  padding: 4px 6px;
  font-size: 13px;
  color: var(--color-text-1); /* 确保文字清晰 */
  transition: all 0.1s ease;
}

.arco-input:focus,
input:focus {
  border: 2px inset var(--color-primary);
  box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.3), 0 0 0 1px var(--color-primary);
  outline: none;
}

/* 经典复选框和单选框 - Windows 95/98 风格 */
.arco-checkbox,
.arco-radio,
input[type="checkbox"],
input[type="radio"] {
  width: 13px;
  height: 13px;
  border: 2px inset var(--border-base);
  background-color: var(--bg-2);
  box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.2);
  border-radius: 0;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  transition: all 0.1s ease;
}

.arco-checkbox:checked,
.arco-radio:checked,
input[type="checkbox"]:checked,
input[type="radio"]:checked {
  background-color: var(--bg-active);
  border: 2px inset var(--border-base);
  box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.3);
}

.arco-checkbox:checked::after,
input[type="checkbox"]:checked::after {
  content: "✓";
  display: block;
  color: var(--text-primary);
  font-size: 10px;
  font-weight: bold;
  text-align: center;
  line-height: 9px;
}

.arco-radio {
  border-radius: 50%;
}

.arco-radio:checked::after,
input[type="radio"]:checked::after {
  content: "";
  display: block;
  width: 5px;
  height: 5px;
  background-color: var(--text-primary);
  border-radius: 50%;
  margin: 2px auto;
}

/* ==================== 表单标签样式 - 保持简洁 ==================== */
/* 表单标签 - 移除不必要的背景色和边框，只作为标题显示 */
.arco-form-label-item,
[class*="form-label"],
[class*="arco-form-label"],
.arco-col[class*="form-label"],
.arco-form-item-label,
[class*="arco-form-item-label"] {
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  margin: 0 !important;
  color: var(--color-text-1) !important;
}

/* 表单标签文字 - 确保清晰可见 */
.arco-form-label-item *,
[class*="form-label"] *,
[class*="arco-form-label"] *,
.arco-col[class*="form-label"] *,
.arco-form-item-label *,
[class*="arco-form-item-label"] * {
  color: var(--color-text-1) !important;
  background-color: transparent !important;
}

/* 深色模式表单标签 */
[data-theme='dark'] .arco-form-label-item,
[data-theme='dark'] [class*="form-label"],
[data-theme='dark'] [class*="arco-form-label"],
[data-theme='dark'] .arco-col[class*="form-label"],
[data-theme='dark'] .arco-form-item-label,
[data-theme='dark'] [class*="arco-form-item-label"] {
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: var(--color-text-1) !important;
}

[data-theme='dark'] .arco-form-label-item *,
[data-theme='dark'] [class*="form-label"] *,
[data-theme='dark'] [class*="arco-form-label"] *,
[data-theme='dark'] .arco-col[class*="form-label"] *,
[data-theme='dark'] .arco-form-item-label *,
[data-theme='dark'] [class*="arco-form-item-label"] * {
  color: var(--color-text-1) !important;
  background-color: transparent !important;
}

/* ==================== 深色模式 (Dark Mode) ==================== */
[data-theme='dark'] {
  /* 主色调 - 深色模式调亮以提高可见度 */
  --color-primary: #4da6f0;
  --primary: #4da6f0;
  --color-primary-light-1: #66b1e1;
  --color-primary-light-2: #80bce8;
  --color-primary-light-3: #99cbeb;
  --color-primary-dark-1: #3399e6;
  --primary-rgb: 77, 166, 240;

  /* 品牌色 - 深色模式 */
  --brand: #4da6f0;
  --brand-light: #1a2a3a;
  --brand-hover: #66b1e1;
  --color-brand-fill: #4da6f0;
  --color-brand-bg: #1a2a3a;

  /* AOU 品牌色板 - 深色模式反转 */
  --aou-1: #001b2c;
  --aou-2: #003052;
  --aou-3: #004578;
  --aou-4: #005a9e;
  --aou-5: #0078d4;
  --aou-6: #4da6f0;
  --aou-7: #66b1e1;
  --aou-8: #80bce8;
  --aou-9: #99cbeb;
  --aou-10: #b3d8f0;

  /* 背景色 - 深色 Windows 风格 */
  --color-bg-1: #1a1a1a;
  --bg-1: #1a1a1a;
  --color-bg-2: #262626;
  --bg-2: #262626;
  --color-bg-3: #333333;
  --bg-3: #333333;
  --color-bg-4: #404040;
  --bg-4: #404040;
  --bg-base: #0d0d0d;
  --bg-hover: #2d2d2d;
  --bg-active: #404040;
  --fill: #1a1a1a;
  --color-fill: #1a1a1a;

  /* 文字色 - 高对比度 */
  --color-text-1: #e0e0e0;
  --text-primary: #e0e0e0;
  --color-text-2: #b0b0b0;
  --text-secondary: #b0b0b0;
  --color-text-3: #808080;
  --text-disabled: #808080;
  --text-0: #ffffff;

  /* 边框色 */
  --color-border: #5a5a5a;
  --color-border-1: #5a5a5a;
  --color-border-2: #404040;
  --border-base: #5a5a5a;
  --border-light: #404040;

  /* 语义色 - 深色模式调整 */
  --success: #4caf50; /* Windows 绿（深色模式调亮） */
  --warning: #ff9800;
  --danger: #f44336;
  --info: #4da6f0;
  
  /* Windows 经典绿色 - 深色模式 */
  --windows-green: #4caf50;
  --windows-green-light: #66bb6a;
  --windows-green-dark: #388e3c;

  /* 消息和组件色 */
  --message-user-bg: #1a2a3a;
  --message-tips-bg: #1a1a1a;
  --workspace-btn-bg: #2d2d2d;
  
  /* 对话框颜色 */
  --dialog-fill-0: rgba(26, 26, 26, 0.95);
}

/* ===== 深色模式全局样式 ===== */
[data-theme='dark'] body,
[data-theme='dark'] html {
  background-color: var(--bg-1);
  color: var(--text-primary);
}

[data-theme='dark'] .arco-layout,
[data-theme='dark'] [class*="layout"] {
  background-color: var(--bg-1);
}

[data-theme='dark'] .arco-layout-content {
  background-color: var(--bg-1);
}

/* ===== 深色模式侧边栏 ===== */
[data-theme='dark'] .layout-sider {
  background-color: var(--bg-3);
  border-right: 2px solid var(--border-base);
}

[data-theme='dark'] .layout-sider.collapsed {
  overflow: hidden !important;
}

[data-theme='dark'] .layout-sider.collapsed * {
  overflow: hidden !important;
}

[data-theme='dark'] .layout-sider.collapsed::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

[data-theme='dark'] .layout-sider-header {
  background: linear-gradient(180deg, #005a9e 0%, #004578 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 1px 2px rgba(0, 0, 0, 0.4);
}

/* ===== 深色模式背景图 ===== */
/* 参考 Hello Kitty 模式：只在 ::before 上设置半透明遮罩 */
[data-theme='dark'] .layout-content.bg-1::before {
  background: linear-gradient(
    135deg,
    rgba(26, 42, 58, 0.7) 0%,
    rgba(30, 46, 62, 0.75) 50%,
    rgba(26, 42, 58, 0.7) 100%
  );
}

[data-theme='dark'] [class*="chat-layout"] .arco-layout-content::before,
[data-theme='dark'] [class*="conversation"] .arco-layout-content::before {
  opacity: 0.2;
  filter: brightness(0.9) saturate(1.1);
}

/* ===== 深色模式输入框 ===== */
[data-theme='dark'] .guidInputCard textarea,
[data-theme='dark'] [class*="guidInputCard"] textarea {
  background-color: rgba(38, 38, 38, 0.98);
  color: var(--color-text-1);
}

[data-theme='dark'] .sendbox-container:not([class*="model"]):not([class*="Model"]),
[data-theme='dark'] [class*="sendbox"]:not([class*="input"]):not([class*="textarea"]):not([class*="model"]):not([class*="Model"]):not([class*="tools"]) {
  background-color: rgba(38, 38, 38, 0.95);
  border: 2px outset var(--border-base);
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.1), inset -1px -1px 0 rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.3);
}

[data-theme='dark'] .sendbox-container textarea,
[data-theme='dark'] [class*="sendbox"] textarea {
  color: var(--text-primary);
}

[data-theme='dark'] .guidInputCard {
  background-color: rgba(38, 38, 38, 0.95);
  border: 2px outset var(--border-base);
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.1), inset -1px -1px 0 rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.3);
}

/* ===== 深色模式消息气泡 ===== */
[data-theme='dark'] .message-item.user .message-bubble,
[data-theme='dark'] [class*="message"][class*="user"] .message-content {
  background: linear-gradient(180deg, #005a9e 0%, #004578 100%);
  color: var(--text-white);
  border: 1px solid #004578;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 2px 4px rgba(0, 0, 0, 0.4);
}

[data-theme='dark'] .message-item.ai .message-bubble,
[data-theme='dark'] .message-item.assistant .message-bubble,
[data-theme='dark'] [class*="message"][class*="ai"] .message-content,
[data-theme='dark'] [class*="message"][class*="assistant"] .message-content {
  background: rgba(38, 38, 38, 0.98);
  border: 1px solid var(--border-base);
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.1), inset -1px -1px 0 rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.3);
  color: var(--text-primary);
}

[data-theme='dark'] .message-item.ai .arco-alert,
[data-theme='dark'] [class*="message"][class*="ai"] .arco-alert,
[data-theme='dark'] .message-item.ai [class*="alert"],
[data-theme='dark'] [class*="message"][class*="ai"] [class*="alert"] {
  background-color: rgba(38, 38, 38, 0.9);
  border-color: var(--border-base);
  color: var(--text-primary);
}

[data-theme='dark'] .message-item.ai .arco-card,
[data-theme='dark'] [class*="message"][class*="ai"] .arco-card,
[data-theme='dark'] .message-item.ai [class*="card"],
[data-theme='dark'] [class*="message"][class*="ai"] [class*="card"] {
  background-color: rgba(38, 38, 38, 0.9);
  border-color: var(--border-base);
  color: var(--text-primary);
}

/* ===== 深色模式按钮 ===== */
[data-theme='dark'] .arco-btn-primary:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]),
[data-theme='dark'] button[type="primary"]:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]) {
  background: linear-gradient(180deg, #005a9e 0%, #004578 100%);
  border: 2px outset #005a9e;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 2px 4px rgba(0, 0, 0, 0.4);
}

[data-theme='dark'] .arco-btn-primary:hover:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]),
[data-theme='dark'] button[type="primary"]:hover:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]) {
  background: linear-gradient(180deg, #0078d4 0%, #005a9e 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 3px 6px rgba(0, 0, 0, 0.5);
}

[data-theme='dark'] .arco-btn-success,
[data-theme='dark'] button[type="success"] {
  background: linear-gradient(180deg, #388e3c 0%, #2e7d32 100%);
  border: 2px outset #388e3c;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 2px 4px rgba(0, 0, 0, 0.4);
}

[data-theme='dark'] .arco-btn-success:hover,
[data-theme='dark'] button[type="success"]:hover {
  background: linear-gradient(180deg, #4caf50 0%, #388e3c 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 3px 6px rgba(0, 0, 0, 0.5);
}

/* 深色模式 Windows 绿点缀 */
[data-theme='dark'] .arco-alert[class*="success"],
[data-theme='dark'] [class*="alert"][class*="success"],
[data-theme='dark'] .arco-message-success,
[data-theme='dark'] [class*="message"][class*="success"] {
  background-color: rgba(76, 175, 80, 0.15);
  border: 1px solid #4caf50;
  border-left: 3px solid #4caf50;
}

[data-theme='dark'] a:not([class*="button"]):not([class*="btn"])[class*="success"],
[data-theme='dark'] a:not([class*="button"]):not([class*="btn"])[class*="confirm"] {
  color: #4caf50;
}

[data-theme='dark'] a:not([class*="button"]):not([class*="btn"])[class*="success"]:hover,
[data-theme='dark'] a:not([class*="button"]):not([class*="btn"])[class*="confirm"]:hover {
  color: #66bb6a;
  text-decoration: underline;
}

/* 深色模式 Windows 绿点缀 - 复选框选中状态 */
[data-theme='dark'] .arco-checkbox-checked .arco-checkbox-icon,
[data-theme='dark'] input[type="checkbox"]:checked {
  background-color: #4caf50;
  border-color: #4caf50;
}

/* 深色模式 Windows 绿点缀 - 单选框选中状态 */
[data-theme='dark'] .arco-radio-checked .arco-radio-button,
[data-theme='dark'] input[type="radio"]:checked {
  border-color: #4caf50;
}

[data-theme='dark'] .arco-radio-checked .arco-radio-button::after {
  background-color: #4caf50;
}

/* 深色模式 Windows 绿点缀 - 进度条成功状态 */
[data-theme='dark'] .arco-progress-line[class*="success"],
[data-theme='dark'] .arco-progress-line[data-status="success"] {
  background-color: rgba(76, 175, 80, 0.15);
}

[data-theme='dark'] .arco-progress-line[class*="success"] .arco-progress-line-inner,
[data-theme='dark'] .arco-progress-line[data-status="success"] .arco-progress-line-inner {
  background-color: #4caf50;
}

/* 深色模式 Windows 绿点缀 - 标签成功状态 */
[data-theme='dark'] .arco-tag[class*="success"],
[data-theme='dark'] .arco-tag[data-color="green"] {
  background-color: rgba(76, 175, 80, 0.15);
  border-color: #4caf50;
  color: #4caf50;
}

/* ===== 深色模式滚动条 ===== */
[data-theme='dark'] ::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #5a5a5a 0%, #404040 100%);
  border: 1px solid #5a5a5a;
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.2), inset -1px -1px 0 rgba(0, 0, 0, 0.4);
}

[data-theme='dark'] ::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #6a6a6a 0%, #4d4d4d 100%);
}

[data-theme='dark'] ::-webkit-scrollbar-track {
  background: var(--bg-1);
  border: 1px solid var(--border-base);
  box-shadow: inset 1px 1px 0 rgba(0, 0, 0, 0.3);
}

[data-theme='dark'] ::-webkit-scrollbar-button {
  background: var(--bg-3);
  border: 1px solid var(--border-base);
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.1), inset -1px -1px 0 rgba(0, 0, 0, 0.4);
}

/* ===== 深色模式其他元素 ===== */
[data-theme='dark'] ::selection {
  background-color: var(--color-primary);
  color: var(--text-white);
}

[data-theme='dark'] a:not([class*="button"]):not([class*="btn"]) {
  color: var(--color-primary);
}

[data-theme='dark'] a:hover:not([class*="button"]):not([class*="btn"]) {
  color: var(--color-primary-light-1);
}

[data-theme='dark'] .arco-tooltip-popup,
[data-theme='dark'] .arco-popover-popup {
  z-index: 10000 !important; /* 确保 tooltip 在最上层 */
}

[data-theme='dark'] .arco-tooltip-inner,
[data-theme='dark'] .arco-popover-inner,
[data-theme='dark'] .arco-popover-content {
  background: rgba(45, 45, 45, 0.98) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-base) !important;
  box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5) !important;
  padding: 4px 8px !important;
  font-size: 12px !important;
  line-height: 1.4 !important;
  max-width: 200px !important;
  word-wrap: break-word !important;
}

[data-theme='dark'] .arco-tooltip-inner *,
[data-theme='dark'] .arco-popover-inner *,
[data-theme='dark'] .arco-popover-content * {
  color: var(--text-primary) !important;
  background-color: transparent !important;
}

/* 深色模式侧边栏 tooltip - 使用系统默认配色 */
[data-theme='dark'] .layout-sider ~ .arco-tooltip-popup,
[data-theme='dark'] .layout-sider .arco-tooltip-popup {
  z-index: 10001 !important;
}

[data-theme='dark'] .arco-modal-body {
  background: var(--bg-2);
  backdrop-filter: blur(8px);
  border: 2px outset var(--border-base);
  color: var(--text-primary);
}

[data-theme='dark'] .arco-modal-header {
  background: linear-gradient(180deg, #005a9e 0%, #004578 100%);
  color: var(--text-white);
  border-bottom: 1px solid rgba(0, 0, 0, 0.3);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .arco-modal-footer {
  background: var(--bg-2);
  border-top: 1px solid var(--border-base);
  color: var(--text-primary);
}

/* ===== 深色模式输入框 ===== */
[data-theme='dark'] .arco-input,
[data-theme='dark'] input[type="text"],
[data-theme='dark'] input[type="password"],
[data-theme='dark'] input[type="email"],
[data-theme='dark'] input[type="number"],
[data-theme='dark'] input[type="search"] {
  background-color: var(--bg-2);
  border: 2px inset var(--border-base);
  box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.4);
  color: var(--text-primary);
}

[data-theme='dark'] .arco-input:focus,
[data-theme='dark'] input:focus {
  border: 2px inset var(--color-primary);
  box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--color-primary);
}

/* ===== 深色模式复选框和单选框 ===== */
[data-theme='dark'] .arco-checkbox,
[data-theme='dark'] .arco-radio,
[data-theme='dark'] input[type="checkbox"],
[data-theme='dark'] input[type="radio"] {
  background-color: var(--bg-2);
  border: 2px inset var(--border-base);
  box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.4);
}

[data-theme='dark'] .arco-checkbox:checked,
[data-theme='dark'] .arco-radio:checked,
[data-theme='dark'] input[type="checkbox"]:checked,
[data-theme='dark'] input[type="radio"]:checked {
  background-color: var(--bg-active);
  border: 2px inset var(--border-base);
  box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.5);
}

/* ==================== 响应式调整 ==================== */
@media (max-width: 768px) {
  .guidInputCard,
  .sendbox-container {
    border-radius: 4px;
  }

  .message-item.user .message-bubble,
  .message-item.ai .message-bubble,
  .message-item.assistant .message-bubble {
    border-radius: 4px;
    padding: 10px 14px;
  }

  .arco-btn-primary,
  .arco-btn-secondary {
    border-radius: 4px;
    padding: 8px 16px;
  }
}

/* ==================== 打印样式 ==================== */
@media print {
  .layout-content.bg-1::before,
  [class*="chat-layout"] .arco-layout-content::before {
    display: none;
  }

  * {
    box-shadow: none !important;
    text-shadow: none !important;
  }
}
`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];
