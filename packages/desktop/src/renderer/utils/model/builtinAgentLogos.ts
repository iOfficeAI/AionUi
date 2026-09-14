/**
 * @license
 * Copyright 2025 AIbang (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 内置 Agent Logo 屏蔽表
 * Built-in agent logo suppression list
 *
 * Logo 真值由后端 `/api/agents/management` 下发，但个别内置图素在桌面端无法
 * 正常加载或辨识度差（例如 Codex CLI 的图标）。此表按后端资源路径屏蔽这些
 * 图素：命中时不再渲染 <img>，各调用方直接回退到默认标识。
 */

/** Keyed by the raw backend-served asset path (before origin resolution). */
const SUPPRESSED_BUILTIN_LOGO_PATHS = new Set<string>([
  '/api/assets/logos/tools/coding/codex.svg',
]);

/**
 * Whether a backend asset path should be hidden from the UI entirely. Query
 * strings/hash fragments are ignored when matching.
 */
export function isSuppressedBuiltinLogo(rawPath: string | null | undefined): boolean {
  if (!rawPath) return false;
  const path = rawPath.trim().split(/[?#]/, 1)[0];
  return SUPPRESSED_BUILTIN_LOGO_PATHS.has(path);
}
