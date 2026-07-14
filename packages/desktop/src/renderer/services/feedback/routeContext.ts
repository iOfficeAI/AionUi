/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FeedbackDiagnosticsExplicitContext } from '@/common/types/feedbackDiagnostics';

export function captureFeedbackRoute(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const hash = window.location.hash.trim();
  if (hash) return hash;
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return path.trim() || undefined;
}

export function feedbackDiagnosticsContextFromRoute(
  route: string | undefined
): FeedbackDiagnosticsExplicitContext | undefined {
  const match = route?.trim().match(/^#?\/(conversation|team)\/([^/?#]+)/);
  if (!match) return undefined;

  let id: string;
  try {
    id = decodeURIComponent(match[2]).trim();
  } catch {
    return undefined;
  }
  if (!id) return undefined;

  return match[1] === 'team' ? { teamId: id } : { conversationId: id };
}
