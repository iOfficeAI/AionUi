/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';

type ErrorWithDetails = Error & {
  details?: {
    causeMessage?: unknown;
    stderrTail?: unknown;
    stdoutTail?: unknown;
  };
};

const GLIBC_VERSION_RE = /GLIBC_(\d+\.\d+)/g;
const GLIBC_NOT_FOUND_RE = /GLIBC_\d+\.\d+[\s\S]{0,160}not found|not found[\s\S]{0,160}GLIBC_\d+\.\d+/i;

function collectBackendStartupText(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);
  if (typeof error === 'string') parts.push(error);

  const details = (error as ErrorWithDetails | undefined)?.details;
  for (const value of [details?.causeMessage, details?.stderrTail, details?.stdoutTail]) {
    if (typeof value === 'string') parts.push(value);
  }

  return parts.join('\n');
}

function extractMissingGlibcVersions(text: string): string[] {
  if (!GLIBC_NOT_FOUND_RE.test(text)) return [];

  const versions = new Set<string>();
  for (const match of text.matchAll(GLIBC_VERSION_RE)) {
    versions.add(match[1]);
  }

  return [...versions].sort((a, b) => {
    const [aMajor, aMinor] = a.split('.').map(Number);
    const [bMajor, bMinor] = b.split('.').map(Number);
    return aMajor - bMajor || aMinor - bMinor;
  });
}

export function classifyBackendStartupFailure(error: unknown): BackendStartupFailureInfo {
  const text = collectBackendStartupText(error);
  const requiredVersions = extractMissingGlibcVersions(text);
  if (requiredVersions.length > 0) {
    return {
      reason: 'backend_incompatible_runtime',
      runtime: 'glibc',
      requiredVersions,
    };
  }

  return { reason: 'backend_startup_failed' };
}
