/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';

type ErrorWithDetails = Error & {
  details?: {
    stage?: unknown;
    isPackaged?: unknown;
    causeMessage?: unknown;
    stderrTail?: unknown;
    stdoutTail?: unknown;
    runtimeKey?: unknown;
    bundledDirExists?: unknown;
    runtimeDirExists?: unknown;
    resourcesDirEntries?: unknown;
  };
};

const GLIBC_VERSION_RE = /GLIBC_(\d+\.\d+)/g;
const GLIBC_NOT_FOUND_RE = /GLIBC_\d+\.\d+[\s\S]{0,160}not found|not found[\s\S]{0,160}GLIBC_\d+\.\d+/i;
const PACKAGED_APP_MARKER_ENTRIES = new Set(['app.asar', 'app.asar.unpacked/']);

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

function getBackendStartupDetails(error: unknown): ErrorWithDetails['details'] | undefined {
  return (error as ErrorWithDetails | undefined)?.details;
}

function getStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length === value.length ? strings : undefined;
}

function classifyIncompleteInstallation(details: ErrorWithDetails['details']): BackendStartupFailureInfo | undefined {
  if (!details) return undefined;
  if (details.stage !== 'resolve_binary' || details.isPackaged !== true) return undefined;

  const resourcesDirEntries = getStringArray(details.resourcesDirEntries);
  if (!resourcesDirEntries) return undefined;

  const hasPackagedApp = resourcesDirEntries.some((entry) => PACKAGED_APP_MARKER_ENTRIES.has(entry));
  if (!hasPackagedApp) return undefined;

  const missingResources = resourcesDirEntries.includes('bundled-aioncore/') ? [] : ['bundled-aioncore/'];
  if (details.runtimeDirExists === false && typeof details.runtimeKey === 'string') {
    missingResources.push(`bundled-aioncore/${details.runtimeKey}/`);
  }

  const missingBundledRuntime = details.bundledDirExists === false || details.runtimeDirExists === false;
  if (!missingBundledRuntime || missingResources.length === 0) return undefined;

  return {
    reason: 'backend_incomplete_installation',
    missingResources,
  };
}

export function classifyBackendStartupFailure(error: unknown): BackendStartupFailureInfo {
  const incompleteInstallation = classifyIncompleteInstallation(getBackendStartupDetails(error));
  if (incompleteInstallation) return incompleteInstallation;

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
