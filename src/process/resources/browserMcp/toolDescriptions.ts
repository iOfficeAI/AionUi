/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tool descriptions for Browser MCP tools.
 * Each tool is defined as { name, description, inputSchema, outputSchema }.
 */

import { z } from 'zod';
import {
  BROWSER_COPY_TO_CLIPBOARD,
  BROWSER_PASTE_FROM_CLIPBOARD,
  BROWSER_PRESS_KEYS,
  BROWSER_MOUSE_MOVE,
  BROWSER_MOUSE_DRAG,
  BROWSER_MOUSE_CONTEXT_CLICK,
} from './constants';

/* ── Shared types ───────────────────────────────────────────────────────────── */

/** A CSS selector or full element locator for targeting DOM nodes. */
const SELECTOR_DESCRIPTION = 'CSS selector string targeting the element (e.g. "#username", "input[name=email]")';

const BROWSER_TOOL_BASE_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', description: 'Whether the operation succeeded' },
    message: { type: 'string', description: 'Human-readable result or error message' },
  },
  required: ['ok', 'message'],
};

/* ── browser_copy_to_clipboard ─────────────────────────────────────────────── */

const COPY_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    selector: {
      type: 'string',
      description: SELECTOR_DESCRIPTION,
    },
  },
  required: ['selector'],
};

const COPY_OUTPUT_SCHEMA = {
  ...BROWSER_TOOL_BASE_OUTPUT,
  properties: {
    ...BROWSER_TOOL_BASE_OUTPUT.properties,
    textLength: { type: 'number', description: 'Number of characters copied to clipboard' },
  },
  required: ['ok', 'message', 'textLength'],
};

export const COPY_TOOL = {
  name: BROWSER_COPY_TO_CLIPBOARD,
  description:
    'Copy text content from a page element to the system clipboard. ' +
    'Extracts the visible text of the element matched by the CSS selector, then writes it to the OS clipboard. ' +
    'Works across all platforms (Windows / macOS / Linux). ' +
    'Example: copy the value of a password field, copy the text of a notification, etc.',
  inputSchema: COPY_INPUT_SCHEMA,
  outputSchema: COPY_OUTPUT_SCHEMA,
} as const;

/* ── browser_paste_from_clipboard ───────────────────────────────────────────── */

const PASTE_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    selector: {
      type: 'string',
      description: SELECTOR_DESCRIPTION,
    },
  },
  required: ['selector'],
};

export const PASTE_TOOL = {
  name: BROWSER_PASTE_FROM_CLIPBOARD,
  description:
    'Paste text from the system clipboard into a page element. ' +
    'Reads the OS clipboard content, focuses the target element, clears any existing content, ' +
    'then inserts the clipboard text. Works across all platforms (Windows / macOS / Linux). ' +
    'Example: paste a password from clipboard into a login field, paste formatted text into a text area, etc.',
  inputSchema: PASTE_INPUT_SCHEMA,
  outputSchema: { ...BROWSER_TOOL_BASE_OUTPUT },
} as const;

/* ── browser_press_keys ────────────────────────────────────────────────────── */

const PRESS_KEYS_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    keys: {
      type: 'string',
      description:
        'Keys to press in Playwright key format. Supports modifier keys: ' +
        '"Control+c" (copy), "Control+v" (paste), "Control+a" (select all), ' +
        '"Control+/" / "Control+-" (zoom in/out on the page), ' +
        '"Control+0" (reset zoom). On macOS the "Control" modifier is automatically translated to "Meta" (⌘). ' +
        'You can also specify "Meta+c" directly if you are on macOS. ' +
        'Examples: "Control+c", "Meta+c", "Control+Shift+i", "Enter", "Tab".',
    },
  },
  required: ['keys'],
};

export const PRESS_KEYS_TOOL = {
  name: BROWSER_PRESS_KEYS,
  description:
    'Press keyboard keys on the active page element. ' +
    'Use this to execute clipboard shortcuts (Control+c / Control+v), page zoom shortcuts (Control+/ / Control+-), ' +
    'or any other keyboard shortcut. ' +
    'Cross-platform: on macOS, "Control" is automatically replaced with "Meta" (Command key). ' +
    'If you need a different modifier on macOS, pass "Meta" directly. ' +
    "This tool uses Playwright's page.keyboard.press() which is cross-platform by design.",
  inputSchema: PRESS_KEYS_INPUT_SCHEMA,
  outputSchema: { ...BROWSER_TOOL_BASE_OUTPUT },
} as const;

/* ── browser_mouse_move ───────────────────────────────────────────────────── */

const MOUSE_MOVE_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    x: { type: 'number', description: 'X coordinate in page pixels (from top-left of viewport)' },
    y: { type: 'number', description: 'Y coordinate in page pixels (from top-left of viewport)' },
    steps: {
      type: 'number',
      description: 'Number of interpolation steps for the mouse movement (default: 1)',
    },
  },
  required: ['x', 'y'],
};

export const MOUSE_MOVE_TOOL = {
  name: BROWSER_MOUSE_MOVE,
  description:
    'Move the mouse cursor to the specified (x, y) coordinates on the page viewport. ' +
    'Useful for precise mouse positioning, triggering hover effects on specific elements, ' +
    'or positioning before a drag operation. Cross-platform: coordinates are in CSS pixels, ' +
    'independent of OS zoom level or device pixel ratio. ' +
    'Example: move mouse to a specific button position, then use click or context_click.',
  inputSchema: MOUSE_MOVE_INPUT_SCHEMA,
  outputSchema: { ...BROWSER_TOOL_BASE_OUTPUT },
} as const;

/* ── browser_mouse_drag ─────────────────────────────────────────────────────── */

const MOUSE_DRAG_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fromX: { type: 'number', description: 'Start X coordinate in page pixels' },
    fromY: { type: 'number', description: 'Start Y coordinate in page pixels' },
    toX: { type: 'number', description: 'End X coordinate in page pixels' },
    toY: { type: 'number', description: 'End Y coordinate in page pixels' },
    steps: {
      type: 'number',
      description: 'Number of interpolation steps for the drag (default: 1)',
    },
  },
  required: ['fromX', 'fromY', 'toX', 'toY'],
};

export const MOUSE_DRAG_TOOL = {
  name: BROWSER_MOUSE_DRAG,
  description:
    'Drag the mouse from one point to another on the page viewport. ' +
    'Simulates a real mouse drag: mousedown at (fromX, fromY), move to (toX, toY), then mouseup. ' +
    'Useful for dragging elements, resizing, drag-and-drop interactions, or selecting text by dragging. ' +
    'Coordinates are in CSS pixels. Cross-platform compatible.',
  inputSchema: MOUSE_DRAG_INPUT_SCHEMA,
  outputSchema: { ...BROWSER_TOOL_BASE_OUTPUT },
} as const;

/* ── browser_mouse_context_click ───────────────────────────────────────────── */

const MOUSE_CONTEXT_CLICK_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    x: { type: 'number', description: 'X coordinate in page pixels' },
    y: { type: 'number', description: 'Y coordinate in page pixels' },
  },
  required: ['x', 'y'],
};

export const MOUSE_CONTEXT_CLICK_TOOL = {
  name: BROWSER_MOUSE_CONTEXT_CLICK,
  description:
    'Perform a right-click (context click) at the specified (x, y) coordinates. ' +
    'Opens the browser context menu at that position. Useful for accessing "Inspect", ' +
    '"Save image as...", "Copy image", or other context menu items. ' +
    'Coordinates are in CSS pixels. Cross-platform compatible.',
  inputSchema: MOUSE_CONTEXT_CLICK_INPUT_SCHEMA,
  outputSchema: { ...BROWSER_TOOL_BASE_OUTPUT },
} as const;

/* ── Export all tools ───────────────────────────────────────────────────────── */

export const BROWSER_TOOL_DESCRIPTIONS: readonly (typeof COPY_TOOL)[] = [
  COPY_TOOL,
  PASTE_TOOL,
  PRESS_KEYS_TOOL,
  MOUSE_MOVE_TOOL,
  MOUSE_DRAG_TOOL,
  MOUSE_CONTEXT_CLICK_TOOL,
];
