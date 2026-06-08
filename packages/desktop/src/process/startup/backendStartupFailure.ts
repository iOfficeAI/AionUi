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
    backendBoundaryCode?: unknown;
    backendBoundaryStage?: unknown;
    runtimeKey?: unknown;
    binaryName?: unknown;
    bundledDirExists?: unknown;
    runtimeDirExists?: unknown;
    resourcesDirEntries?: unknown;
    runtimeDirEntries?: unknown;
    packageArch?: unknown;
    deviceArch?: unknown;
    expectedDownloadArch?: unknown;
    isRosettaTranslated?: unknown;
  };
};

const GLIBC_VERSION_RE = /GLIBC_(\d+\.\d+)/g;
const GLIBC_NOT_FOUND_RE = /GLIBC_\d+\.\d+[\s\S]{0,160}not found|not found[\s\S]{0,160}GLIBC_\d+\.\d+/i;
const PACKAGED_APP_MARKER_ENTRIES = new Set(['app.asar', 'app.asar.unpacked/']);
const MAX_REPORTED_DIR_ENTRIES = 20;

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

  return [...versions].toSorted((a, b) => {
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

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function classifyPackageArchitectureMismatch(
  details: ErrorWithDetails['details']
): BackendStartupFailureInfo | undefined {
  if (!details) return undefined;
  if (details.stage !== 'startup_architecture_check') return undefined;

  return {
    reason: 'backend_package_architecture_mismatch',
    packageArch: getString(details.packageArch),
    deviceArch: getString(details.deviceArch),
    expectedDownloadArch: getString(details.expectedDownloadArch),
    isRosettaTranslated: typeof details.isRosettaTranslated === 'boolean' ? details.isRosettaTranslated : undefined,
  };
}

function getMissingDirectoryFlag(entries: string[], directoryName: string): boolean | undefined {
  if (entries.includes(directoryName)) return false;
  return entries.length < MAX_REPORTED_DIR_ENTRIES ? true : undefined;
}

function classifyIncompleteInstallation(details: ErrorWithDetails['details']): BackendStartupFailureInfo | undefined {
  if (!details) return undefined;
  if (details.stage !== 'resolve_binary' || details.isPackaged !== true) return undefined;

  const resourcesDirEntries = getStringArray(details.resourcesDirEntries);
  if (!resourcesDirEntries) return undefined;

  const hasPackagedApp = resourcesDirEntries.some((entry) => PACKAGED_APP_MARKER_ENTRIES.has(entry));
  if (!hasPackagedApp) return undefined;

  const missingBundledAioncoreDir = !resourcesDirEntries.includes('bundled-aioncore/');
  const missingRuntimeDir = details.runtimeDirExists === false && typeof details.runtimeKey === 'string';
  const missingResources = missingBundledAioncoreDir ? ['bundled-aioncore/'] : [];
  if (details.runtimeDirExists === false && typeof details.runtimeKey === 'string') {
    missingResources.push(`bundled-aioncore/${details.runtimeKey}/`);
  }
  const runtimeDirEntries = getStringArray(details.runtimeDirEntries);
  const missingManagedResourcesDir =
    details.runtimeDirExists === true &&
    typeof details.runtimeKey === 'string' &&
    runtimeDirEntries !== undefined &&
    !runtimeDirEntries.includes('managed-resources/');
  if (missingManagedResourcesDir && typeof details.runtimeKey === 'string') {
    missingResources.push(`bundled-aioncore/${details.runtimeKey}/managed-resources/`);
  }
  const missingRuntimeBinary =
    details.runtimeDirExists === true &&
    typeof details.runtimeKey === 'string' &&
    typeof details.binaryName === 'string' &&
    runtimeDirEntries !== undefined &&
    !runtimeDirEntries.includes(details.binaryName);
  if (missingRuntimeBinary && typeof details.runtimeKey === 'string' && typeof details.binaryName === 'string') {
    missingResources.push(`bundled-aioncore/${details.runtimeKey}/${details.binaryName}`);
  }

  if (missingResources.length === 0) return undefined;

  return {
    incompleteInstallationKind:
      missingBundledAioncoreDir || missingRuntimeDir || missingManagedResourcesDir
        ? 'missing_directory_resources'
        : 'missing_backend_binary',
    missingBackendBinary:
      missingBundledAioncoreDir || missingRuntimeDir || missingManagedResourcesDir || missingRuntimeBinary,
    missingBundledAioncoreDir,
    missingHubDir: getMissingDirectoryFlag(resourcesDirEntries, 'hub/'),
    missingPetStatesDir: getMissingDirectoryFlag(resourcesDirEntries, 'pet-states/'),
    missingPwaDir: getMissingDirectoryFlag(resourcesDirEntries, 'pwa/'),
    reason: 'backend_incomplete_installation',
    missingResources,
    missingRuntimeDir,
  };
}

export function classifyBackendStartupFailure(error: unknown): BackendStartupFailureInfo {
  const details = getBackendStartupDetails(error);
  const packageArchitectureMismatch = classifyPackageArchitectureMismatch(details);
  if (packageArchitectureMismatch) return packageArchitectureMismatch;

  const incompleteInstallation = classifyIncompleteInstallation(details);
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

  const backendBoundaryCode =
    typeof details?.backendBoundaryCode === 'string' ? details.backendBoundaryCode : undefined;
  const backendBoundaryStage =
    typeof details?.backendBoundaryStage === 'string' ? details.backendBoundaryStage : undefined;

  return {
    reason: 'backend_startup_failed',
    backendBoundaryCode,
    backendBoundaryStage,
  };
}
