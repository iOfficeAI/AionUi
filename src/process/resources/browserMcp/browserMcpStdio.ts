/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Built-in stdio MCP server for browser automation tools (clipboard, mouse, keyboard).
 *
 * Connects directly to the AionUi browser via CDP (Chrome DevTools Protocol).
 * Provides cross-platform clipboard copy/paste, mouse operations, and keyboard shortcuts.
 *
 * Pattern: matches imageGenServer.ts — simple stdio MCP server using @modelcontextprotocol/sdk.
 */

import { chromium, type Browser, type Page } from 'playwright';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  BROWSER_COPY_TO_CLIPBOARD,
  BROWSER_PASTE_FROM_CLIPBOARD,
  BROWSER_PRESS_KEYS,
  BROWSER_MOUSE_MOVE,
  BROWSER_MOUSE_DRAG,
  BROWSER_MOUSE_CONTEXT_CLICK,
  BROWSER_MCP_SERVER_NAME,
} from './constants';

/* ── Configuration ──────────────────────────────────────────────────────────── */

const CDP_ENDPOINT = process.env.AIONUI_CDP_URL || 'http://127.0.0.1:9222';
const TOOL_TIMEOUT_MS = 15_000;
const IS_MAC = process.platform === 'darwin';

/* ── Cross-platform key normalization ───────────────────────────────────────── */

/**
 * Normalize modifier keys for cross-platform compatibility.
 * On macOS, "Control" in Playwright key strings is translated to "Meta" (Command ⌘).
 * Pass-through "Meta" if already specified.
 */
function normalizeKeys(keys: string): string {
  if (!IS_MAC) return keys;
  return keys.replace(/\bControl\b/g, 'Meta');
}

/* ── Browser connection ────────────────────────────────────────────────────── */

let browser: Browser | null = null;
let currentPage: Page | null = null;

async function getBrowserPage(): Promise<Page> {
  if (currentPage) return currentPage;

  // Try connecting to existing AionUi browser via CDP
  try {
    browser = await chromium.connectOverCDP(CDP_ENDPOINT, { timeout: 5_000 });
    const pages = await browser.pages();
    if (pages.length > 0) {
      currentPage = pages[pages.length - 1];
      return currentPage;
    }
  } catch {
    // CDP endpoint not available yet; will fall through to headless launch
  }

  // Fallback: launch a headless browser if no CDP endpoint
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  currentPage = await browser.newPage();
  return currentPage;
}

/* ── Clipboard helpers ──────────────────────────────────────────────────────── */

async function readSystemClipboard(page: Page): Promise<string> {
  try {
    return await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return '';
      }
    });
  } catch {
    return '';
  }
}

async function writeSystemClipboard(page: Page, text: string): Promise<boolean> {
  return page.evaluate(async (textToCopy: string) => {
    const ta = document.createElement('textarea');
    ta.value = textToCopy;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      const result = document.execCommand('copy');
      document.body.removeChild(ta);
      return result;
    } catch {
      document.body.removeChild(ta);
      return false;
    }
  }, text);
}

/* ── Tool implementations ───────────────────────────────────────────────────── */

async function toolCopyToClipboard(selector: string): Promise<{ ok: boolean; message: string; textLength?: number }> {
  const page = await getBrowserPage();
  try {
    const text = await page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      if ((el as HTMLElement).tagName === 'INPUT' || (el as HTMLElement).tagName === 'TEXTAREA') {
        return (el as HTMLInputElement | HTMLTextAreaElement).value;
      }
      return el.textContent || el.innerText || '';
    }, selector);

    if (text === null) return { ok: false, message: `Element not found: "${selector}"` };
    if (typeof text !== 'string') return { ok: false, message: 'Element does not contain text content' };

    const trimmed = text.trim();
    if (!trimmed) return { ok: true, message: 'Element found but contains no text', textLength: 0 };

    const success = await writeSystemClipboard(page, trimmed);
    return success
      ? {
          ok: true,
          message: `Copied ${trimmed.length} characters to clipboard from "${selector}"`,
          textLength: trimmed.length,
        }
      : { ok: false, message: 'Failed to write to clipboard (permission denied)', textLength: 0 };
  } catch (err) {
    return { ok: false, message: `Error: ${(err as Error).message}`, textLength: 0 };
  }
}

async function toolPasteFromClipboard(selector: string): Promise<{ ok: boolean; message: string }> {
  const page = await getBrowserPage();
  try {
    const clipboardText = await readSystemClipboard(page);
    if (!clipboardText) {
      return {
        ok: false,
        message:
          'System clipboard is empty. Copy some text first (e.g. via browser_copy_to_clipboard or an external app).',
      };
    }

    const el = await page.$(selector);
    if (!el) return { ok: false, message: `Element not found: "${selector}"` };

    await el.focus();
    await page.keyboard.press(normalizeKeys('Control+a'));
    await page.keyboard.press(normalizeKeys('Control+v'));
    return { ok: true, message: `Pasted ${clipboardText.length} characters from clipboard into "${selector}"` };
  } catch (err) {
    return { ok: false, message: `Error: ${(err as Error).message}` };
  }
}

async function toolPressKeys(keys: string): Promise<{ ok: boolean; message: string }> {
  const page = await getBrowserPage();
  const normalized = normalizeKeys(keys);
  try {
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press(normalized);

    const keyLower = normalized.toLowerCase();
    let hint = '';
    if (keyLower.includes('/')) hint = ' (page zoom affected)';
    else if (keyLower.includes('-')) hint = ' (page zoom affected)';
    else if (keyLower.includes('+') || keyLower === '0') hint = ' (page zoom affected)';
    else if (keyLower.includes('c')) hint = ' (text copied to clipboard)';
    else if (keyLower.includes('v')) hint = ' (text pasted from clipboard)';

    return { ok: true, message: `Pressed keys: "${normalized}"${hint}` };
  } catch (err) {
    return { ok: false, message: `Error pressing keys "${keys}": ${(err as Error).message}` };
  }
}

async function toolMouseMove(x: number, y: number, steps?: number): Promise<{ ok: boolean; message: string }> {
  const page = await getBrowserPage();
  try {
    await page.mouse.move(x, y, { steps: steps || 1 });
    return { ok: true, message: `Mouse moved to (${x}, ${y})` };
  } catch (err) {
    return { ok: false, message: `Error moving mouse: ${(err as Error).message}` };
  }
}

async function toolMouseDrag(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  steps?: number
): Promise<{ ok: boolean; message: string }> {
  const page = await getBrowserPage();
  try {
    await page.mouse.move(fromX, fromY, { steps: steps || 1 });
    await page.mouse.down();
    await page.mouse.move(toX, toY, { steps: steps || 1 });
    await page.mouse.up();
    return { ok: true, message: `Mouse dragged from (${fromX}, ${fromY}) to (${toX}, ${toY})` };
  } catch (err) {
    return { ok: false, message: `Error dragging mouse: ${(err as Error).message}` };
  }
}

async function toolMouseContextClick(x: number, y: number): Promise<{ ok: boolean; message: string }> {
  const page = await getBrowserPage();
  try {
    await page.mouse.click(x, y, { button: 'right' });
    return { ok: true, message: `Context click (right-click) at (${x}, ${y})` };
  } catch (err) {
    return { ok: false, message: `Error context clicking: ${(err as Error).message}` };
  }
}

/* ── MCP Server ─────────────────────────────────────────────────────────────── */

const server = new McpServer({ name: BROWSER_MCP_SERVER_NAME, version: '1.0.0' });

server.tool(
  BROWSER_COPY_TO_CLIPBOARD,
  'Copy text content from a page element to the system clipboard. Extracts visible text from the element matched by the CSS selector, then writes it to the OS clipboard. Works across all platforms (Windows / macOS / Linux). Example: copy the value of an input field, copy text from a notification, etc.',
  {
    selector: z.string().describe('CSS selector targeting the element (e.g. "#username", "input[name=email]")'),
  },
  async ({ selector }) => {
    const result = await toolCopyToClipboard(selector);
    return {
      content: [{ type: 'text' as const, text: result.message }],
      isError: !result.ok,
    };
  }
);

server.tool(
  BROWSER_PASTE_FROM_CLIPBOARD,
  'Paste text from the system clipboard into a page element. Reads the OS clipboard content, focuses the target element, selects all existing content, then inserts the clipboard text. Works across all platforms (Windows / macOS / Linux). Example: paste a password from clipboard into a login field, paste formatted text into a text area, etc.',
  {
    selector: z.string().describe('CSS selector targeting the element (e.g. "#password", "textarea#content")'),
  },
  async ({ selector }) => {
    const result = await toolPasteFromClipboard(selector);
    return {
      content: [{ type: 'text' as const, text: result.message }],
      isError: !result.ok,
    };
  }
);

server.tool(
  BROWSER_PRESS_KEYS,
  'Press keyboard keys on the active page element. Use this to execute clipboard shortcuts (Control+c to copy, Control+v to paste), page zoom shortcuts (Control+/ zoom in, Control+- zoom out, Control+0 reset zoom), or any other keyboard shortcut. Cross-platform: on macOS, "Control" is automatically translated to "Meta" (Command key ⌘). You can also pass "Meta+c" directly for macOS-specific usage. Uses Playwright\'s page.keyboard.press() which is cross-platform by design.',
  {
    keys: z
      .string()
      .describe(
        'Keys to press in Playwright key format. Examples: "Control+c" (copy), "Control+v" (paste), ' +
          '"Control+a" (select all), "Control+/" (zoom in), "Control+-" (zoom out), "Control+0" (reset zoom), ' +
          '"Enter", "Tab". On macOS "Control" is auto-translated to "Meta" (Command). For direct macOS usage, pass "Meta+c".'
      ),
  },
  async ({ keys }) => {
    const result = await toolPressKeys(keys);
    return {
      content: [{ type: 'text' as const, text: result.message }],
      isError: !result.ok,
    };
  }
);

server.tool(
  BROWSER_MOUSE_MOVE,
  'Move the mouse cursor to the specified (x, y) coordinates on the page viewport. Useful for precise mouse positioning, triggering hover effects, or positioning before a drag operation. Coordinates are in CSS pixels (independent of OS zoom or device pixel ratio). Example: move mouse to a button position, then perform click or context click.',
  {
    x: z.number().describe('X coordinate in page pixels (from top-left of viewport)'),
    y: z.number().describe('Y coordinate in page pixels (from top-left of viewport)'),
    steps: z.number().optional().describe('Number of interpolation steps for smooth movement (default: 1)'),
  },
  async ({ x, y, steps }) => {
    const result = await toolMouseMove(x, y, steps);
    return {
      content: [{ type: 'text' as const, text: result.message }],
      isError: !result.ok,
    };
  }
);

server.tool(
  BROWSER_MOUSE_DRAG,
  'Drag the mouse from one point to another on the page viewport. Simulates a real mouse drag: mousedown at start, move to end, then mouseup. Useful for dragging UI elements, resizing, drag-and-drop interactions, or selecting text by dragging. Coordinates are in CSS pixels. Cross-platform compatible.',
  {
    fromX: z.number().describe('Start X coordinate in page pixels'),
    fromY: z.number().describe('Start Y coordinate in page pixels'),
    toX: z.number().describe('End X coordinate in page pixels'),
    toY: z.number().describe('End Y coordinate in page pixels'),
    steps: z.number().optional().describe('Number of interpolation steps for smooth dragging (default: 1)'),
  },
  async ({ fromX, fromY, toX, toY, steps }) => {
    const result = await toolMouseDrag(fromX, fromY, toX, toY, steps);
    return {
      content: [{ type: 'text' as const, text: result.message }],
      isError: !result.ok,
    };
  }
);

server.tool(
  BROWSER_MOUSE_CONTEXT_CLICK,
  'Perform a right-click (context click) at the specified (x, y) coordinates. Opens the browser context menu at that position. Useful for accessing Inspect Element, Save Image As, Copy Image, or other context menu items. Coordinates are in CSS pixels. Cross-platform compatible.',
  {
    x: z.number().describe('X coordinate in page pixels'),
    y: z.number().describe('Y coordinate in page pixels'),
  },
  async ({ x, y }) => {
    const result = await toolMouseContextClick(x, y);
    return {
      content: [{ type: 'text' as const, text: result.message }],
      isError: !result.ok,
    };
  }
);

/* ── Main ───────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  process.stderr.write(
    `[browser-mcp-stdio] Starting MCP server (CDP: ${CDP_ENDPOINT}, platform: ${process.platform})\n`
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[browser-mcp-stdio] MCP server ready\n');
}

main().catch((err) => {
  process.stderr.write(`[browser-mcp-stdio] Fatal error: ${err}\n`);
  process.exit(1);
});
