/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Detect whether a shell command is launching a localhost URL via the system
 * "open" facility (macOS `open`, Linux `xdg-open`, Windows `start`).
 *
 * Returns the URL when matched, otherwise null. Used to redirect such commands
 * into the in-app DevBrowser so the user can pick page elements as chat
 * context, instead of having the OS pop a separate browser window.
 */
export function detectLocalhostOpenCommand(command: string | undefined | null): string | null {
  if (!command || typeof command !== 'string') return null;

  // Strip leading env-style prefix like `BROWSER=open` (rare but possible).
  const trimmed = command.trim();
  if (!trimmed) return null;

  // Match: optional sudo, then one of [open / xdg-open / start], then a URL.
  // We deliberately accept the URL anywhere on the line so that compound
  // commands like `npm run dev & sleep 2 && open http://localhost:3000` still
  // get caught.
  const re = /(?:^|[\s;&|`(])(?:open|xdg-open|start)\s+(?:"|')?(https?:\/\/[^\s"'`)]+)/i;
  const m = re.exec(trimmed);
  if (!m) return null;

  const url = m[1];
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '0.0.0.0') {
      return url;
    }
  } catch {
    return null;
  }
  return null;
}
