/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createGeaEnvironmentId, DEFAULT_GEA_BASE_URL, normalizeGeaBaseUrl } from '@aionui/web-host';
import type {
  GeaEndpointProfileV1,
  GeaEnvironmentSource,
  GeaEnvironmentStatus,
  GeaEnvironmentUpdateResult,
} from '@/common/types/platform/larkAuth';

const GEA_BASE_URL_ENV = 'AIONUI_GEA_BASE_URL';
const LEGACY_GEA_BASE_URL_ENV = 'AUTH_BROKER_PUBLIC_URL';
const PUBLISHED_SOURCE_ENV = 'AIONUI_INTERNAL_GEA_BASE_URL_SOURCE';
const PROFILE_KEY = 'gea.endpointProfile';

let activeEnvironment: GeaEnvironmentStatus | null = null;

export { createGeaEnvironmentId };

export function resolveGeaEnvironment(options: {
  env?: NodeJS.ProcessEnv;
  isPackaged: boolean;
  profile?: GeaEndpointProfileV1;
}): GeaEnvironmentStatus {
  const env = options.env ?? process.env;
  let candidate: string;
  let source: GeaEnvironmentSource;

  const publishedSource = env[PUBLISHED_SOURCE_ENV];
  const hasExplicitBaseUrl =
    Object.hasOwn(env, GEA_BASE_URL_ENV) &&
    publishedSource !== 'profile' &&
    publishedSource !== 'default' &&
    publishedSource !== 'legacyEnvironment';

  if (hasExplicitBaseUrl) {
    candidate = env[GEA_BASE_URL_ENV] ?? '';
    source = 'environment';
  } else if (options.profile) {
    candidate = options.profile.baseUrl;
    source = 'profile';
  } else if (Object.hasOwn(env, LEGACY_GEA_BASE_URL_ENV)) {
    candidate = env[LEGACY_GEA_BASE_URL_ENV] ?? '';
    source = 'legacyEnvironment';
  } else {
    candidate = DEFAULT_GEA_BASE_URL;
    source = 'default';
  }

  const baseUrl = normalizeGeaBaseUrl(candidate, { allowLoopbackHttp: !options.isPackaged });
  return {
    baseUrl,
    editable: source === 'default' || source === 'profile',
    environmentId: createGeaEnvironmentId(baseUrl),
    source,
  };
}

export function initializeGeaEnvironment(options: {
  env?: NodeJS.ProcessEnv;
  isPackaged: boolean;
  profile?: GeaEndpointProfileV1;
}): GeaEnvironmentStatus {
  if (activeEnvironment) return activeEnvironment;
  activeEnvironment = resolveGeaEnvironment({
    env: options.env ?? process.env,
    isPackaged: options.isPackaged,
    profile: options.profile,
  });
  activateGeaEnvironment(activeEnvironment);
  return activeEnvironment;
}

/** Publish only after the runtime owner has replaced every environment-bound service. */
export function activateGeaEnvironment(environment: GeaEnvironmentStatus): void {
  activeEnvironment = environment;
  process.env[GEA_BASE_URL_ENV] = environment.baseUrl;
  process.env[PUBLISHED_SOURCE_ENV] = environment.source;
}

export function getGeaEnvironment(): GeaEnvironmentStatus {
  if (!activeEnvironment) throw new Error('GEA_ENVIRONMENT_NOT_INITIALIZED');
  return activeEnvironment;
}

export async function saveGeaEnvironment(
  baseUrl: string,
  options: {
    isPackaged: boolean;
    persist: (profile: GeaEndpointProfileV1) => Promise<unknown>;
  }
): Promise<GeaEnvironmentUpdateResult> {
  const current = getGeaEnvironment();
  if (!current.editable) throw new Error('GEA_ENVIRONMENT_MANAGED');

  const normalizedBaseUrl = normalizeGeaBaseUrl(baseUrl, { allowLoopbackHttp: !options.isPackaged });
  const environment: GeaEnvironmentStatus = {
    baseUrl: normalizedBaseUrl,
    editable: true,
    environmentId: createGeaEnvironmentId(normalizedBaseUrl),
    source: 'profile',
  };
  const changed = normalizedBaseUrl !== current.baseUrl;
  if (changed || current.source !== 'profile') {
    await options.persist({
      baseUrl: environment.baseUrl,
      environmentId: environment.environmentId,
      revision: 1,
    });
    // Do not let this process's published value masquerade as a managed
    // startup override after Electron relaunches. The next process must read
    // the profile that was just persisted.
    delete process.env[GEA_BASE_URL_ENV];
    delete process.env[PUBLISHED_SOURCE_ENV];
  }
  return { changed, environment };
}

export function resetGeaEnvironmentForTests(): void {
  activeEnvironment = null;
}

export { PROFILE_KEY as GEA_ENDPOINT_PROFILE_KEY };
