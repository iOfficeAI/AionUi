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
    cover: defaultThemeCover,
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
    css: `             /* Misaka Mikoto Theme - 御坂美琴主题 */
/* 参考《科学超电磁炮》配色风格 */
 
:root {
  /* 主色调 - Tokiwadai Blue & Electric Blue */
  --color-primary: #1e3a8a;
  --primary: #1e3a8a;
  --color-primary-light-1: #3b82f6;
  --color-primary-light-2: #60a5fa;
  --color-primary-light-3: #93c5fd;
  --color-primary-dark-1: #1e40af;
  --primary-rgb: 30, 58, 138;
  
  /* 品牌色 - Electric & Tokiwadai */
  --brand: #1e3a8a;
  --brand-light: #dbeafe;
  --brand-hover: #3b82f6;
  --color-brand-fill: #1e3a8a;
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
  
  /* 背景色 - Light Blue/White */
  --color-bg-1: #f0f9ff;
  --bg-1: #f0f9ff;
  --color-bg-2: #ffffff;
  --bg-2: #ffffff;
  --color-bg-3: #e0f2fe;
  --bg-3: #e0f2fe;
  --color-bg-4: #bae6fd;
  --bg-4: #bae6fd;
  --bg-base: #ffffff;
  --bg-hover: #e0f2fe;
  --bg-active: #bae6fd;
  --fill: #f0f9ff;
  --color-fill: #f0f9ff;
  
  /* 文字色 - Dark Blue/Black */
  --color-text-1: #1e293b;
  --text-primary: #1e293b;
  --color-text-2: #475569;
  --text-secondary: #475569;
  --color-text-3: #94a3b8;
  --text-disabled: #94a3b8;
  --text-0: #1e293b;
  
  /* 边框色 - Blue Border */
  --color-border: #93c5fd;
  --color-border-1: #93c5fd;
  --color-border-2: #bfdbfe;
  --border-base: #93c5fd;
  --border-light: #bfdbfe;
  
  /* 语义色 - Electric Colors */
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #3b82f6;
  
  /* 消息背景色 - Message Backgrounds */
  --message-user-bg: #dbeafe;
  --message-tips-bg: #f0f9ff;
  --workspace-btn-bg: #e0f2fe;
  
  /* 对话框颜色 - Dialog Colors */
  --dialog-fill-0: rgba(255, 255, 255, 0.9);
}
 
/* 全局字体 - 现代科技感字体 */
body {
  font-family: "Inter", "SF Pro Display", "Segoe UI", "Microsoft YaHei", sans-serif;
}
 
/* 全局背景色 - 浅蓝色调 */
body,
html {
  background-color: var(--bg-1, #f0f9ff);
}
 
/* 全局主要背景区域 */
.arco-layout,
[class*="layout"] {
  background-color: var(--bg-1, #f0f9ff);
}
 
/* 全局内容区域背景 */
.arco-layout-content,
[class*="content"]:not([class*="message"]):not([class*="sendbox"]) {
  background-color: var(--bg-1, #f0f9ff);
}
 
/* 侧边栏样式 - 深蓝色（常盘台校服色） */
.layout-sider {
  background-color: #e0f2fe;
  border-right: 2px solid #93c5fd;
  position: relative;
  z-index: 100;
}
 
.layout-sider-header {
  background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(30, 58, 138, 0.3);
}
 
/* Icon 颜色调整 - 默认状态改为深蓝色，排除系统组件 */
/* 全局图标默认颜色 - 深蓝色系（只设置stroke描边） */
svg:not(.sendbox-model-btn svg):not([class*="sendbox-model"] svg):not([class*="model"] svg):not([class*="Model"] svg),
[class*="icon"]:not(.sendbox-model-btn):not([class*="sendbox-model"]):not([class*="model"]):not([class*="Model"]) svg,
i[class*="icon"]:not(.sendbox-model-btn):not([class*="sendbox-model"]):not([class*="model"]):not([class*="Model"]) {
  fill: none;
  stroke: #1e3a8a;
  color: #1e3a8a;
  transition: stroke 0.3s ease, color 0.3s ease;
}
 
/* 图标hover状态 - 电击蓝 */
svg:not(.sendbox-model-btn svg):not([class*="sendbox-model"] svg):not([class*="model"] svg):not([class*="Model"] svg):hover,
[class*="icon"]:not(.sendbox-model-btn):not([class*="sendbox-model"]):not([class*="model"]):not([class*="Model"]) svg:hover {
  fill: none;
  stroke: #3b82f6;
  color: #3b82f6;
}
 
/* 按钮内的图标 - 默认深蓝色（只设置stroke描边） */
button:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg,
.arco-btn:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg {
  fill: none;
  stroke: #1e3a8a;
  color: #1e3a8a;
  transition: stroke 0.3s ease, color 0.3s ease;
}
 
button:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover,
.arco-btn:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover {
  fill: none;
  stroke: #3b82f6;
  color: #3b82f6;
}
 
/* 侧边栏图标颜色 - 只设置stroke描边 */
.layout-sider svg,
.layout-sider-header svg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.9);
  color: rgba(255, 255, 255, 0.9);
}
 
.layout-sider-header svg:hover {
  fill: none;
  stroke: white;
  color: white;
}
 
/* 背景图片设置 - 只针对主内容区 */
.layout-content.bg-1 {
  background: url('https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1920&q=80') center/cover no-repeat fixed;
  background-size: cover;
  background-position: center center;
  background-color: transparent;
  position: relative;
}
 
/* 半透明遮罩层 - 增加遮罩层透明度，让背景图更浅 */
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
 
/* 聊天页面背景图 - 15% 透明度，浅浅的 */
.chat-layout-header,
[class*="chat-layout"] .arco-layout-content,
[class*="conversation"] .arco-layout-content {
  position: relative;
}
 
[class*="chat-layout"] .arco-layout-content::before,
[class*="conversation"] .arco-layout-content::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url('https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1920&q=80') center/cover no-repeat fixed;
  opacity: 0.15;
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
 
/* 发送框样式 - 只针对可见的发送框容器，排除模型选择器等系统组件 */
.sendbox-container:not([class*="model"]):not([class*="Model"]),
[class*="sendbox"]:not([class*="input"]):not([class*="textarea"]):not([class*="model"]):not([class*="Model"]):not([class*="tools"]) {
  border-radius: 16px;
  border: 2px solid #93c5fd;
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 20px rgba(30, 58, 138, 0.15);
  transition: all 0.3s ease;
}
 
/* 首页输入框对话框 - 白色80%不透明度，确保用户看得清 */
.guidInputCard {
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 2px solid #93c5fd;
  border-radius: 16px;
  box-shadow: 0 2px 20px rgba(30, 58, 138, 0.1);
}
 
/* 发送框内的文本域 - 保持原有样式，只调整边框 */
.sendbox-container textarea,
[class*="sendbox"] textarea {
  border: none;
  background: transparent;
}
 
.sendbox-container:focus-within,
[class*="sendbox"]:focus-within {
  border-color: #3b82f6;
  box-shadow: 0 6px 24px rgba(59, 130, 246, 0.3);
}
 
/* 发送框内图标颜色调整 - 排除模型选择按钮和系统组件（只设置stroke描边） */
.sendbox-container svg:not(.sendbox-model-btn svg):not([class*="model"] svg),
[class*="sendbox"]:not([class*="model"]):not([class*="Model"]) svg:not(.sendbox-model-btn svg) {
  fill: none;
  stroke: #1e3a8a;
  color: #1e3a8a;
  transition: stroke 0.3s ease, color 0.3s ease;
}
 
.sendbox-container svg:not(.sendbox-model-btn svg):not([class*="model"] svg):hover,
[class*="sendbox"]:not([class*="model"]):not([class*="Model"]) svg:not(.sendbox-model-btn svg):hover {
  fill: none;
  stroke: #3b82f6;
  color: #3b82f6;
  transform: scale(1.1);
}
 
/* 用户消息气泡 - 深蓝色（常盘台校服色） */
.message-item.user .message-bubble,
[class*="message"][class*="user"] .message-content {
  background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
  color: white;
  border-radius: 16px 16px 4px 16px;
  border: none;
  box-shadow: 0 4px 12px rgba(30, 58, 138, 0.3);
  padding: 12px 16px;
}
 
/* AI 消息气泡 - 浅蓝色 */
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
 
/* 工具调用消息 - 保持原有样式，只微调背景色以融入主题 */
.message-item.ai .arco-alert,
[class*="message"][class*="ai"] .arco-alert,
[class*="message"][class*="assistant"] .arco-alert,
.message-item.ai [class*="alert"],
[class*="message"][class*="ai"] [class*="alert"],
[class*="message"][class*="assistant"] [class*="alert"] {
  background-color: rgba(255, 255, 255, 0.6);
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  box-shadow: none;
  backdrop-filter: none;
  margin: 4px 0;
}
 
/* 工具调用卡片 - 恢复原有样式，微调 */
.message-item.ai .arco-card,
[class*="message"][class*="ai"] .arco-card,
[class*="message"][class*="assistant"] .arco-card,
.message-item.ai [class*="card"],
[class*="message"][class*="ai"] [class*="card"],
[class*="message"][class*="assistant"] [class*="card"] {
  background-color: rgba(255, 255, 255, 0.6);
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  box-shadow: none;
  backdrop-filter: none;
  margin: 4px 0;
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
  background-color: rgba(255, 255, 255, 0.8);
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 2px 6px;
}
 
/* 主要按钮样式 - 深蓝色渐变 */
.arco-btn-primary:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]),
button[type="primary"]:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]) {
  background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
  border-color: #1e3a8a;
  border-radius: 12px;
  font-weight: 600;
  color: white;
  transition: all 0.3s ease;
}
 
.arco-btn-primary:hover:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]),
button[type="primary"]:hover:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]) {
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
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
 
/* 滚动条美化 - 蓝色系，normal状态下透明，hover时显示 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
 
::-webkit-scrollbar-thumb {
  background: transparent; /* normal状态下透明 */
  border-radius: 4px;
  transition: background 0.3s ease;
}
 
::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%); /* hover时显示蓝色 */
}
 
/* 当容器hover时，滚动条也显示 */
*:hover::-webkit-scrollbar-thumb {
  background: rgba(59, 130, 246, 0.3);
}
 
*:hover::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
}
 
::-webkit-scrollbar-track {
  background: transparent; /* 轨道也透明 */
  border-radius: 4px;
}
 
/* 选中文字 */
::selection {
  background-color: #3b82f6;
  color: white;
}
 
/* 链接样式 */
a:not([class*="button"]):not([class*="btn"]) {
  color: #1e3a8a;
  transition: color 0.3s ease;
}
 
a:hover:not([class*="button"]):not([class*="btn"]) {
  color: #3b82f6;
  text-decoration: underline;
}
 
/* 按钮内图标颜色 - 只针对主要按钮，排除模型选择器等系统组件（只设置stroke描边） */
.arco-btn-primary:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg {
  fill: none;
  stroke: white;
  color: white;
  transition: stroke 0.3s ease;
}
 
/* 次要按钮图标颜色 - 排除模型选择器（只设置stroke描边） */
.arco-btn-secondary:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg,
button[type="secondary"]:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg {
  fill: none;
  stroke: #1e3a8a;
  color: #1e3a8a;
  transition: stroke 0.3s ease;
}
 
.arco-btn-secondary:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover,
button[type="secondary"]:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover {
  fill: none;
  stroke: #3b82f6;
  color: #3b82f6;
}
 
/* 消息区域图标颜色 - 只针对消息气泡内的图标（只设置stroke描边） */
.message-item .message-content svg,
[class*="message"] [class*="content"] svg {
  fill: none;
  stroke: #475569;
  color: #475569;
  transition: stroke 0.3s ease, color 0.3s ease;
}
 
.message-item:hover .message-content svg,
[class*="message"]:hover [class*="content"] svg {
  fill: none;
  stroke: #3b82f6;
  color: #3b82f6;
}
 
/* Tooltip 和 Popover 样式优化 - 深蓝色背景，白色文字 */
.arco-tooltip-popup,
.arco-popover-popup {
  pointer-events: none; /* 避免遮挡鼠标事件 */
}
 
/* 内部容器样式 */
.arco-tooltip-inner,
.arco-popover-inner,
.arco-popover-content {
  background-color: #1e3a8a; /* 深蓝色背景 */
  color: #ffffff; /* 白色文字 */
  border: 1px solid #1e40af;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(30, 58, 138, 0.4);
  backdrop-filter: none;
}
 
/* 强制内部文字颜色为白色 */
.arco-tooltip-inner *,
.arco-popover-inner *,
.arco-popover-content * {
  color: #ffffff;
}
 
/* 箭头样式 */
.arco-tooltip-arrow,
.arco-popover-arrow {
  border-color: #1e40af;
}
 
/* 对话框背景和透明度 */
.arco-modal-body {
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
}
 
.arco-modal-header {
  background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
  color: white;
  border-bottom: 1px solid #1e40af;
}
 
.arco-modal-footer {
  background-color: rgba(255, 255, 255, 0.8);
  border-top: 1px solid #93c5fd;
}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'hello-kitty',
    name: 'Hello Kitty',
    isPreset: true,
    cover: helloKittyCover,
    css: `             
/* 核心颜色变量 - Hello Kitty 粉色系 - 全局主题色 */
:root {
  /* 主色调 - Primary Colors */
  --color-primary: #ff85a2;
  --primary: #ff85a2;
  --color-primary-light-1: #ffb7c5;
  --color-primary-light-2: #ffe4e8;
  --color-primary-light-3: #fff0f3;
  --color-primary-dark-1: #e06b88;
  --primary-rgb: 255, 133, 162;
  
  /* 品牌色 - Brand Colors */
  --brand: #ff85a2;
  --brand-light: #fff0f3;
  --brand-hover: #ffb7c5;
  --color-brand-fill: #ff85a2;
  --color-brand-bg: #fff0f3;
  
  /* AOU 品牌色板 - 粉色系渐变 */
  --aou-1: #fff0f3;
  --aou-2: #ffe4e8;
  --aou-3: #ffcad4;
  --aou-4: #ffb7c5;
  --aou-5: #ff9db6;
  --aou-6: #ff85a2;
  --aou-7: #e06b88;
  --aou-8: #c95a75;
  --aou-9: #a84a62;
  --aou-10: #8c3d4f;
  
  /* 背景色 - Background Colors */
  --color-bg-1: #fff0f3;
  --bg-1: #fff0f3;
  --color-bg-2: #ffffff;
  --bg-2: #ffffff;
  --color-bg-3: #ffe4e8;
  --bg-3: #ffe4e8;
  --color-bg-4: #ffb7c5;
  --bg-4: #ffb7c5;
  --bg-base: #ffffff;
  --bg-hover: #ffe4e8;
  --bg-active: #ffcad4;
  --fill: #fff0f3;
  --color-fill: #fff0f3;
  
  /* 文字色 - Text Colors */
  --color-text-1: #5a3e45;
  --text-primary: #5a3e45;
  --color-text-2: #8c6b74;
  --text-secondary: #8c6b74;
  --color-text-3: #bfa5ac;
  --text-disabled: #bfa5ac;
  --text-0: #5a3e45;
  
  /* 边框色 - Border Colors */
  --color-border: #ffcad4;
  --color-border-1: #ffcad4;
  --color-border-2: #ffe4e8;
  --border-base: #ffcad4;
  --border-light: #ffe4e8;
  
  /* 语义色 - Semantic Colors (保持可读性，轻微粉色调) */
  --success: #00b42a;
  --warning: #ff7d00;
  --danger: #f53f3f;
  --info: #ff85a2;
  
  /* 消息背景色 - Message Backgrounds */
  --message-user-bg: #ffe4e8;
  --message-tips-bg: #fff0f3;
  --workspace-btn-bg: #fff0f3;
  
  /* 对话框颜色 - Dialog Colors */
  --dialog-fill-0: rgba(255, 255, 255, 0.9);
}
 
/* 全局字体 - 更圆润可爱 */
body {
  font-family: "Varela Round", "Nunito", "Microsoft YaHei", sans-serif;
}
 
/* 全局背景色 - 确保整体粉色调 */
body,
html {
  background-color: var(--bg-1, #fff0f3);
}
 
/* 全局主要背景区域 */
.arco-layout,
[class*="layout"] {
  background-color: var(--bg-1, #fff0f3);
}
 
/* 全局内容区域背景 */
.arco-layout-content,
[class*="content"]:not([class*="message"]):not([class*="sendbox"]) {
  background-color: var(--bg-1, #fff0f3);
}
 
/* 侧边栏样式 */
.layout-sider {
  background-color: #fff0f3;
  border-right: 2px solid #ffcad4;
  position: relative;
  z-index: 100;
}
 
.layout-sider-header {
  background: linear-gradient(135deg, #ff85a2 0%, #ff9db6 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(255, 133, 162, 0.3);
}
 
/* Icon 颜色调整 - 默认状态改为粉色，排除系统组件 */
/* 全局图标默认颜色 - 粉色系（只设置stroke描边，不设置fill填充） */
svg:not(.sendbox-model-btn svg):not([class*="sendbox-model"] svg):not([class*="model"] svg):not([class*="Model"] svg),
[class*="icon"]:not(.sendbox-model-btn):not([class*="sendbox-model"]):not([class*="model"]):not([class*="Model"]) svg,
i[class*="icon"]:not(.sendbox-model-btn):not([class*="sendbox-model"]):not([class*="model"]):not([class*="Model"]) {
  fill: none;
  stroke: #ff85a2;
  color: #ff85a2;
  transition: stroke 0.3s ease, color 0.3s ease;
}
 
/* 图标hover状态 */
svg:not(.sendbox-model-btn svg):not([class*="sendbox-model"] svg):not([class*="model"] svg):not([class*="Model"] svg):hover,
[class*="icon"]:not(.sendbox-model-btn):not([class*="sendbox-model"]):not([class*="model"]):not([class*="Model"]) svg:hover {
  fill: none;
  stroke: #ff9db6;
  color: #ff9db6;
}
 
/* 按钮内的图标 - 默认粉色（只设置stroke描边） */
button:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg,
.arco-btn:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg {
  fill: none;
  stroke: #ff85a2;
  color: #ff85a2;
  transition: stroke 0.3s ease, color 0.3s ease;
}
 
button:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover,
.arco-btn:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover {
  fill: none;
  stroke: #ff9db6;
  color: #ff9db6;
}
 
/* 侧边栏图标颜色 - 只设置stroke描边 */
.layout-sider svg,
.layout-sider-header svg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.9);
  color: rgba(255, 255, 255, 0.9);
}
 
.layout-sider-header svg:hover {
  fill: none;
  stroke: white;
  color: white;
}
 
/* 背景图片设置 - 只针对主内容区 */
.layout-content.bg-1 {
  background: url('https://wallpapercg.com/media/ts_2x/24836.webp') center/cover no-repeat fixed;
  background-size: cover;
  background-position: center center;
  background-color: transparent;
  position: relative;
}
 
/* 半透明遮罩层 - 增加遮罩层透明度，让背景图更浅 */
.layout-content.bg-1::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(255, 240, 243, 0.75) 0%,
    rgba(255, 228, 232, 0.8) 50%,
    rgba(255, 240, 243, 0.75) 100%
  );
  z-index: 0;
  pointer-events: none;
}
 
/* 聊天页面背景图 - 15% 透明度，浅浅的 */
.chat-layout-header,
[class*="chat-layout"] .arco-layout-content,
[class*="conversation"] .arco-layout-content {
  position: relative;
}
 
[class*="chat-layout"] .arco-layout-content::before,
[class*="conversation"] .arco-layout-content::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url('https://wallpapercg.com/media/ts_2x/24836.webp') center/cover no-repeat fixed;
  opacity: 0.15;
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
  background-color:rgba(255, 255, 255, 0.98);
  color: var(--color-text-1);
}
 
/* 发送框样式 - 只针对可见的发送框容器，排除模型选择器等系统组件 */
.sendbox-container:not([class*="model"]):not([class*="Model"]),
[class*="sendbox"]:not([class*="input"]):not([class*="textarea"]):not([class*="model"]):not([class*="Model"]):not([class*="tools"]) {
  border-radius: 24px;
  border: 2px solid #ffb7c5;
  background-color: rgb(255, 255, 255); /* 白色80%不透明度 */
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 20px rgba(255, 133, 162, 0.25);
  transition: all 0.3s ease;
}
 
/* 首页输入框对话框 - 白色80%不透明度，确保用户看得清 */
.guidInputCard {
  background-color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  border: 2px solid #ffb7c5;
  border-radius: 20px;
  box-shadow: 0 2px 20px rgba(255, 133, 162, 0.1);
}
 
/* 发送框内的文本域 - 保持原有样式，只调整边框 */
.sendbox-container textarea,
[class*="sendbox"] textarea {
  border: none;
  background: transparent;
}
 
.sendbox-container:focus-within,
[class*="sendbox"]:focus-within {
  border-color: #ff85a2;
  box-shadow: 0 6px 24px rgba(255, 133, 162, 0.5);
}
 
/* 发送框内图标颜色调整 - 排除模型选择按钮和系统组件（只设置stroke描边） */
.sendbox-container svg:not(.sendbox-model-btn svg):not([class*="model"] svg),
[class*="sendbox"]:not([class*="model"]):not([class*="Model"]) svg:not(.sendbox-model-btn svg) {
  fill: none;
  stroke: #ff85a2;
  color: #ff85a2;
  transition: stroke 0.3s ease, color 0.3s ease;
}
 
.sendbox-container svg:not(.sendbox-model-btn svg):not([class*="model"] svg):hover,
[class*="sendbox"]:not([class*="model"]):not([class*="Model"]) svg:not(.sendbox-model-btn svg):hover {
  fill: none;
  stroke: #ff9db6;
  color: #ff9db6;
  transform: scale(1.1);
}
 
/* 用户消息气泡 */
.message-item.user .message-bubble,
[class*="message"][class*="user"] .message-content {
  background: linear-gradient(135deg, #ff85a2 0%, #ff9db6 100%);
  color: white;
  border-radius: 20px 20px 4px 20px;
  border: none;
  box-shadow: 0 4px 12px rgba(255, 133, 162, 0.3);
  padding: 12px 16px;
}
 
/* AI 消息气泡 */
.message-item.ai .message-bubble,
[class*="message"][class*="ai"] .message-content,
[class*="message"][class*="assistant"] .message-content {
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 2px solid #ffe4e8;
  border-radius: 20px 20px 20px 4px;
  box-shadow: 0 4px 16px rgba(255, 133, 162, 0.15);
  padding: 12px 16px;
}
 
/* 工具调用消息 - 保持原有样式，只微调背景色以融入主题 */
.message-item.ai .arco-alert,
[class*="message"][class*="ai"] .arco-alert,
[class*="message"][class*="assistant"] .arco-alert,
.message-item.ai [class*="alert"],
[class*="message"][class*="ai"] [class*="alert"],
[class*="message"][class*="assistant"] [class*="alert"] {
  background-color: rgba(255, 255, 255, 0.6);
  border: 1px solid #ffcad4;
  border-radius: 4px;
  box-shadow: none;
  backdrop-filter: none;
  margin: 4px 0;
}
 
/* 工具调用卡片 - 恢复原有样式，微调 */
.message-item.ai .arco-card,
[class*="message"][class*="ai"] .arco-card,
[class*="message"][class*="assistant"] .arco-card,
.message-item.ai [class*="card"],
[class*="message"][class*="ai"] [class*="card"],
[class*="message"][class*="assistant"] [class*="card"] {
  background-color: rgba(255, 255, 255, 0.6);
  border: 1px solid #ffcad4;
  border-radius: 4px;
  box-shadow: none;
  backdrop-filter: none;
  margin: 4px 0;
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
  background-color: rgba(255, 255, 255, 0.8);
  border: 1px solid #ffcad4;
  border-radius: 4px;
  padding: 2px 6px;
}
 
/* 主要按钮样式 - 只针对主要操作按钮，排除模型选择器 */
.arco-btn-primary:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]),
button[type="primary"]:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]) {
  background: linear-gradient(135deg, #ff85a2 0%, #ff9db6 100%);
  border-color: #ff85a2;
  border-radius: 20px;
  font-weight: 600;
  color: white;
  transition: all 0.3s ease;
}
 
.arco-btn-primary:hover:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]),
button[type="primary"]:hover:not([class*="icon"]):not([class*="circle"]):not([class*="model"]):not([class*="Model"]) {
  background: linear-gradient(135deg, #ff9db6 0%, #ffb7c5 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 133, 162, 0.4);
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
 
/* 滚动条美化 - normal状态下透明，hover时显示粉色 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
 
::-webkit-scrollbar-thumb {
  background: transparent; /* normal状态下透明 */
  border-radius: 4px;
  transition: background 0.3s ease;
}
 
::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(135deg, #ffb7c5 0%, #ff85a2 100%); /* hover时显示粉色 */
}
 
/* 当容器hover时，滚动条也显示 */
*:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 133, 162, 0.3);
}
 
*:hover::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(135deg, #ffb7c5 0%, #ff85a2 100%);
}
 
::-webkit-scrollbar-track {
  background: transparent; /* 轨道也透明 */
  border-radius: 4px;
}
 
/* 选中文字 */
::selection {
  background-color: #ff85a2;
  color: white;
}
 
/* 链接样式 */
a:not([class*="button"]):not([class*="btn"]) {
  color: #ff85a2;
  transition: color 0.3s ease;
}
 
a:hover:not([class*="button"]):not([class*="btn"]) {
  color: #ff9db6;
  text-decoration: underline;
}
 
/* 按钮内图标颜色 - 只针对主要按钮，排除模型选择器等系统组件（只设置stroke描边） */
.arco-btn-primary:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg {
  fill: none;
  stroke: white;
  color: white;
  transition: stroke 0.3s ease;
}
 
/* 次要按钮图标颜色 - 排除模型选择器（只设置stroke描边） */
.arco-btn-secondary:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg,
button[type="secondary"]:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg {
  fill: none;
  stroke: #ff85a2;
  color: #ff85a2;
  transition: stroke 0.3s ease;
}
 
.arco-btn-secondary:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover,
button[type="secondary"]:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover {
  fill: none;
  stroke: #ff9db6;
  color: #ff9db6;
}
 
/* Tooltip 和 Popover 样式优化 - 深粉色背景，白色文字，确保高可读性 */
.arco-tooltip-popup,
.arco-popover-popup {
  pointer-events: none; /* 避免遮挡鼠标事件 */
}
 
/* 内部容器样式 */
.arco-tooltip-inner,
.arco-popover-inner,
.arco-popover-content {
  background-color: #e06b88; /* 深粉色背景 */
  color: #ffffff; /* 白色文字 */
  border: 1px solid #c95a75;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(224, 107, 136, 0.4);
  backdrop-filter: none; /* 移除模糊，确保背景色纯正以衬托文字 */
}
 
/* 强制内部文字颜色为白色 */
.arco-tooltip-inner *,
.arco-popover-inner *,
.arco-popover-content * {
  color: #ffffff;
}
 
/* 箭头样式 */
.arco-tooltip-arrow,
.arco-popover-arrow {
  border-color: #c95a75;
}
 
/* 对话框背景和透明度（恢复被删除的样式） */
.arco-modal-body {
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
}
 
.arco-modal-header {
  background-color: rgba(255, 240, 243, 0.9);
  border-bottom: 1px solid #ffcad4;
}
 
.arco-modal-footer {
  background-color: rgba(255, 255, 255, 0.8);
  border-top: 1px solid #ffcad4;
}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'retro-windows',
    name: 'Retro Windows',
    isPreset: true,
    cover: retroWindowsCover,
    css: `             
* 核心颜色变量 - 复古 Windows 配色 */
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
  --color-bg-3: #c0c0c0;
  --bg-3: #c0c0c0;
  --color-bg-4: #808080;
  --bg-4: #808080;
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
  --success: #00a300;
  --warning: #ff8c00;
  --danger: #d13438;
  --info: #0078d4;
  
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
.arco-layout-content,
[class*="content"]:not([class*="message"]):not([class*="sendbox"]) {
  background-color: var(--bg-1, #f0f0f0);
}
 
/* 侧边栏样式 - 经典 Windows 灰色 */
.layout-sider {
  background-color: #e0e0e0;
  border-right: 2px solid #808080;
  position: relative;
  z-index: 100;
}
 
.layout-sider-header {
  background: linear-gradient(180deg, #0078d4 0%, #005a9e 100%);
  color: white;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2);
}
 
/* Icon 颜色调整 - 默认状态改为蓝色，排除系统组件 */
/* 全局图标默认颜色 - 蓝色系（只设置stroke描边） */
svg:not(.sendbox-model-btn svg):not([class*="sendbox-model"] svg):not([class*="model"] svg):not([class*="Model"] svg),
[class*="icon"]:not(.sendbox-model-btn):not([class*="sendbox-model"]):not([class*="model"]):not([class*="Model"]) svg,
i[class*="icon"]:not(.sendbox-model-btn):not([class*="sendbox-model"]):not([class*="model"]):not([class*="Model"]) {
  fill: none;
  stroke: #0078d4;
  color: #0078d4;
  transition: stroke 0.3s ease, color 0.3s ease;
}
 
/* 图标hover状态 */
svg:not(.sendbox-model-btn svg):not([class*="sendbox-model"] svg):not([class*="model"] svg):not([class*="Model"] svg):hover,
[class*="icon"]:not(.sendbox-model-btn):not([class*="sendbox-model"]):not([class*="model"]):not([class*="Model"]) svg:hover {
  fill: none;
  stroke: #1a86d9;
  color: #1a86d9;
}
 
/* 按钮内的图标 - 默认蓝色（只设置stroke描边） */
button:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg,
.arco-btn:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg {
  fill: none;
  stroke: #0078d4;
  color: #0078d4;
  transition: stroke 0.3s ease, color 0.3s ease;
}
 
button:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover,
.arco-btn:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover {
  fill: none;
  stroke: #1a86d9;
  color: #1a86d9;
}
 
/* 侧边栏图标颜色 - 只设置stroke描边 */
.layout-sider svg,
.layout-sider-header svg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.9);
  color: rgba(255, 255, 255, 0.9);
}
 
.layout-sider-header svg:hover {
  fill: none;
  stroke: white;
  color: white;
}
 
/* 背景图片设置 - 只针对主内容区 */
.layout-content.bg-1 {
  background: url('https://wallpapers.com/images/hd/windows-10-default-k4s3pap71thyjavb.jpg') center/cover no-repeat fixed;
  background-size: cover;
  background-position: center center;
  background-color: transparent;
  position: relative;
}
 
/* 半透明遮罩层 - 增加遮罩层透明度，让背景图更浅 */
.layout-content.bg-1::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(240, 240, 240, 0.85) 0%,
    rgba(230, 230, 230, 0.9) 50%,
    rgba(240, 240, 240, 0.85) 100%
  );
  z-index: 0;
  pointer-events: none;
}
 
/* 聊天页面背景图 - 15% 透明度，浅浅的 */
.chat-layout-header,
[class*="chat-layout"] .arco-layout-content,
[class*="conversation"] .arco-layout-content {
  position: relative;
}
 
[class*="chat-layout"] .arco-layout-content::before,
[class*="conversation"] .arco-layout-content::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url('https://wallpapers.com/images/hd/windows-10-default-k4s3pap71thyjavb.jpg') center/cover no-repeat fixed;
  opacity: 0.15;
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
 
/* 发送框样式 - 只针对可见的发送框容器，排除模型选择器等系统组件 */
.sendbox-container:not([class*="model"]):not([class*="Model"]),
[class*="sendbox"]:not([class*="input"]):not([class*="textarea"]):not([class*="model"]):not([class*="Model"]):not([class*="tools"]) {
  border-radius: 4px; /* 经典 Windows 方角 */
  border: 2px outset #c0c0c0; /* 经典 3D 边框效果 */
  background-color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(4px);
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.8), inset -1px -1px 0 rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}
 
/* 首页输入框对话框 - 白色90%不透明度，确保用户看得清 */
.guidInputCard {
  background-color: rgba(255, 255, 255, 0.9);
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
}
 
.sendbox-container:focus-within,
[class*="sendbox"]:focus-within {
  border: 2px inset #808080; /* 聚焦时变为内陷效果 */
  box-shadow: inset 2px 2px 4px rgba(0, 0, 0, 0.2);
}
 
/* 发送框内图标颜色调整 - 排除模型选择按钮和系统组件（只设置stroke描边） */
.sendbox-container svg:not(.sendbox-model-btn svg):not([class*="model"] svg),
[class*="sendbox"]:not([class*="model"]):not([class*="Model"]) svg:not(.sendbox-model-btn svg) {
  fill: none;
  stroke: #0078d4;
  color: #0078d4;
  transition: stroke 0.3s ease, color 0.3s ease;
}
 
.sendbox-container svg:not(.sendbox-model-btn svg):not([class*="model"] svg):hover,
[class*="sendbox"]:not([class*="model"]):not([class*="Model"]) svg:not(.sendbox-model-btn svg):hover {
  fill: none;
  stroke: #1a86d9;
  color: #1a86d9;
  transform: scale(1.1);
}
 
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
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(4px);
  border: 1px solid #c0c0c0;
  border-radius: 4px; /* 方角 */
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.8), inset -1px -1px 0 rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 12px 16px;
}
 
/* 工具调用消息 - 保持原有样式，只微调背景色以融入主题 */
.message-item.ai .arco-alert,
[class*="message"][class*="ai"] .arco-alert,
[class*="message"][class*="assistant"] .arco-alert,
.message-item.ai [class*="alert"],
[class*="message"][class*="ai"] [class*="alert"],
[class*="message"][class*="assistant"] [class*="alert"] {
  background-color: rgba(255, 255, 255, 0.8);
  border: 1px solid #c0c0c0;
  border-radius: 4px;
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.8), inset -1px -1px 0 rgba(0, 0, 0, 0.1);
  backdrop-filter: none;
  margin: 4px 0;
}
 
/* 工具调用卡片 - 恢复原有样式，微调 */
.message-item.ai .arco-card,
[class*="message"][class*="ai"] .arco-card,
[class*="message"][class*="assistant"] .arco-card,
.message-item.ai [class*="card"],
[class*="message"][class*="ai"] [class*="card"],
[class*="message"][class*="assistant"] [class*="card"] {
  background-color: rgba(255, 255, 255, 0.8);
  border: 1px solid #c0c0c0;
  border-radius: 4px;
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.8), inset -1px -1px 0 rgba(0, 0, 0, 0.1);
  backdrop-filter: none;
  margin: 4px 0;
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
  background-color: rgba(255, 255, 255, 0.9);
  border: 1px solid #c0c0c0;
  border-radius: 4px;
  padding: 2px 6px;
}
 
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
 
/* 按钮内图标颜色 - 只针对主要按钮，排除模型选择器等系统组件（只设置stroke描边） */
.arco-btn-primary:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg {
  fill: none;
  stroke: white;
  color: white;
  transition: stroke 0.2s ease;
}
 
/* 次要按钮图标颜色 - 排除模型选择器（只设置stroke描边） */
.arco-btn-secondary:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg,
button[type="secondary"]:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg {
  fill: none;
  stroke: #0078d4;
  color: #0078d4;
  transition: stroke 0.2s ease;
}
 
.arco-btn-secondary:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover,
button[type="secondary"]:not(.sendbox-model-btn):not([class*="model"]):not([class*="Model"]) svg:hover {
  fill: none;
  stroke: #1a86d9;
  color: #1a86d9;
}
 
/* 消息区域图标颜色 - 只针对消息气泡内的图标（只设置stroke描边） */
.message-item .message-content svg,
[class*="message"] [class*="content"] svg {
  fill: none;
  stroke: #404040;
  color: #404040;
  transition: stroke 0.2s ease, color 0.2s ease;
}
 
.message-item:hover .message-content svg,
[class*="message"]:hover [class*="content"] svg {
  fill: none;
  stroke: #0078d4;
  color: #0078d4;
}
 
/* Tooltip 和 Popover 样式优化 - 经典 Windows 灰色背景，黑色文字 */
.arco-tooltip-popup,
.arco-popover-popup {
  pointer-events: none; /* 避免遮挡鼠标事件 */
}
 
/* 内部容器样式 */
.arco-tooltip-inner,
.arco-popover-inner,
.arco-popover-content {
  background-color: #ffffe1; /* 经典 Windows 米黄色 */
  color: #000000; /* 黑色文字 */
  border: 1px solid #808080;
  border-radius: 0; /* 方角 */
  box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  backdrop-filter: none;
}
 
/* 强制内部文字颜色为黑色 */
.arco-tooltip-inner *,
.arco-popover-inner *,
.arco-popover-content * {
  color: #000000;
}
 
/* 箭头样式 */
.arco-tooltip-arrow,
.arco-popover-arrow {
  border-color: #808080;
}
 
/* 对话框背景和透明度 */
.arco-modal-body {
  background-color: rgba(240, 240, 240, 0.95);
  backdrop-filter: blur(4px);
  border: 2px outset #c0c0c0;
}
 
.arco-modal-header {
  background: linear-gradient(180deg, #0078d4 0%, #005a9e 100%);
  color: white;
  border-bottom: 1px solid #005a9e;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
 
.arco-modal-footer {
  background-color: rgba(240, 240, 240, 0.95);
  border-top: 1px solid #c0c0c0;
}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];
