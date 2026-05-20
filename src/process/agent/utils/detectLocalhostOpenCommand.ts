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

  const trimmed = command.trim();
  if (!trimmed) return null;

  // Two-step match — loose by design so common variants don't slip through:
  //   1) command contains a recognized "open URL" token as its own word
  //      (handles `bash -c "open ..."`, `open -a 'Google Chrome' URL`, etc.)
  //   2) and contains a localhost-shaped http(s) URL somewhere in the line
  // We deliberately do NOT enforce that the URL immediately follows the token;
  // false positives are unlikely (you rarely have a localhost URL in an arg
  // that isn't the open target), false negatives are what bit users.
  const hasOpenToken = /(?:^|[\s;&|`("'])(?:open|xdg-open|start)(?:[\s;&|`)"']|$)/i.test(trimmed);
  if (!hasOpenToken) return null;

  const urlMatch = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s"'`)]*)/i.exec(trimmed);
  if (!urlMatch) return null;

  const url = urlMatch[1];
  try {
    // Validate it parses and the host is genuinely loopback (defense in depth).
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
