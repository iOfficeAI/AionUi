/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Constants for the Browser MCP tools — clipboard, mouse, keyboard utilities.
 */

export const BROWSER_MCP_SERVER_NAME = 'browser-mcp';

export const BROWSER_COPY_TO_CLIPBOARD = 'browser_copy_to_clipboard' as const;
export const BROWSER_PASTE_FROM_CLIPBOARD = 'browser_paste_from_clipboard' as const;
export const BROWSER_PRESS_KEYS = 'browser_press_keys' as const;
export const BROWSER_MOUSE_MOVE = 'browser_mouse_move' as const;
export const BROWSER_MOUSE_DRAG = 'browser_mouse_drag' as const;
export const BROWSER_MOUSE_CONTEXT_CLICK = 'browser_mouse_context_click' as const;

/** All browser tool names — used for registration and discovery. */
export const BROWSER_TOOL_NAMES = [
  BROWSER_COPY_TO_CLIPBOARD,
  BROWSER_PASTE_FROM_CLIPBOARD,
  BROWSER_PRESS_KEYS,
  BROWSER_MOUSE_MOVE,
  BROWSER_MOUSE_DRAG,
  BROWSER_MOUSE_CONTEXT_CLICK,
] as const;
