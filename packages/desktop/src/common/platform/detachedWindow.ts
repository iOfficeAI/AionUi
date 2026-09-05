/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const DETACHED_WINDOW_QUERY_KEY = 'window';
export const DETACHED_WINDOW_QUERY_VALUE = 'detached';

export type AppLayoutMode = 'standard' | 'detached';

/** Build the HashRouter location shared by Electron and WebUI pop-outs. */
export const buildDetachedConversationHash = (conversationId: string): string =>
  `#/conversation/${encodeURIComponent(conversationId)}?${DETACHED_WINDOW_QUERY_KEY}=${DETACHED_WINDOW_QUERY_VALUE}`;

/** Build a complete browser URL while retaining the WebUI's served base path. */
export const buildDetachedConversationUrl = (currentUrl: string, conversationId: string): string => {
  const url = new URL(currentUrl);
  url.hash = buildDetachedConversationHash(conversationId).slice(1);
  return url.toString();
};

/** Parse the router search string without treating unrelated window values as detached. */
export const isDetachedWindowSearch = (search: string): boolean =>
  new URLSearchParams(search).get(DETACHED_WINDOW_QUERY_KEY) === DETACHED_WINDOW_QUERY_VALUE;

export const getAppLayoutMode = (search: string): AppLayoutMode =>
  isDetachedWindowSearch(search) ? 'detached' : 'standard';

/** Return the decoded conversation id only for a valid detached conversation route. */
export const getDetachedConversationId = (pathname: string, search: string): string | null => {
  if (!isDetachedWindowSearch(search)) return null;
  const encodedId = pathname.match(/^\/conversation\/([^/]+)$/)?.[1];
  if (!encodedId) return null;
  try {
    return decodeURIComponent(encodedId);
  } catch {
    return null;
  }
};
