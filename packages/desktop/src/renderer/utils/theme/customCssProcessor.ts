/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 自定义 CSS 处理工具
 * 统一处理自定义 CSS 的 !important 添加和格式化
 */

import { parse } from 'postcss';

/**
 * 自动为所有 CSS 声明添加 !important
 *
 * 使用 PostCSS 进行真实的 CSS 解析（AST），只给声明（declaration）追加
 * !important，绝不触碰选择器。这样可以正确处理伪类 / 伪元素选择器
 * （如 `.btn:hover`、`::before`、`:not()`、`::-webkit-scrollbar-thumb:hover`），
 * 也能覆盖块内最后一条没有结尾分号的声明。已带 !important 的声明保持不变。
 *
 * @param css - 原始 CSS 字符串
 * @returns 处理后的 CSS 字符串（所有声明都带 !important）
 */
export const addImportantToAll = (css: string): string => {
  if (!css || !css.trim()) {
    return '';
  }

  try {
    const root = parse(css);
    root.walkDecls((decl) => {
      if (!decl.important) {
        decl.important = true;
      }
    });
    return root.toString();
  } catch {
    // CSS 语法非法时（PostCSS 抛 CssSyntaxError），原样返回输入，
    // 避免因解析失败而中断主题应用。
    return css;
  }
};

/**
 * 包装自定义 CSS，添加注释说明
 * @param css - 处理后的 CSS 字符串
 * @returns 带注释的 CSS 字符串
 */
export const wrapCustomCss = (css: string): string => {
  if (!css || !css.trim()) {
    return '';
  }

  return `
/* 用户自定义样式 - 自动添加 !important 提升优先级 */
/* User Custom Styles - Auto !important for highest priority */
${css}
  `.trim();
};

/**
 * 完整处理自定义 CSS
 * @param css - 原始 CSS 字符串
 * @returns 处理后并包装的 CSS 字符串
 */
export const processCustomCss = (css: string): string => {
  const processed = addImportantToAll(css);
  return wrapCustomCss(processed);
};

/**
 * 验证 CSS 语法（简单验证）
 * @param css - CSS 字符串
 * @returns 是否为有效的 CSS
 */
export const validateCss = (css: string): { valid: boolean; error?: string } => {
  if (!css || !css.trim()) {
    return { valid: true };
  }

  try {
    // 简单验证：检查大括号是否配对
    const openBraces = (css.match(/\{/g) || []).length;
    const closeBraces = (css.match(/\}/g) || []).length;

    if (openBraces !== closeBraces) {
      return {
        valid: false,
        error: 'Unmatched braces: { and } count does not match',
      };
    }

    // 检查是否有基本的 CSS 结构
    if (openBraces > 0 && !css.includes(':')) {
      return {
        valid: false,
        error: 'Invalid CSS: no property declarations found',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
