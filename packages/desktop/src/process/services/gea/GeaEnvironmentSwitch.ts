/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeaEndpointProfileV1, GeaEnvironmentUpdateResult } from '@/common/types/platform/larkAuth';
import { activateGeaEnvironment, getGeaEnvironment, saveGeaEnvironment } from './GeaEnvironmentService';
import { suspendSharedGeaEnvironment, resumeSharedGeaEnvironment } from './LarkAuthService';
import { getPersonalModelGatewayRuntime } from './PersonalModelGatewayRuntime';
import { resetGeaClientEnvironment } from './GeaClientRuntime';

let restartBackend: ((baseUrl: string) => Promise<void>) | undefined;
let transition: Promise<unknown> = Promise.resolve();
let runtimeUnavailable = false;

export function configureGeaEnvironmentSwitch(restart: (baseUrl: string) => Promise<void>): void {
  restartBackend = restart;
}

/** Serialize the whole switch, including rollback, so two windows cannot mix environments. */
export function switchGeaEnvironment(
  baseUrl: string,
  options: { isPackaged: boolean; persist: (profile: GeaEndpointProfileV1) => Promise<unknown> }
): Promise<GeaEnvironmentUpdateResult> {
  const pending = transition
    .catch(() => {})
    .then(async () => {
      if (!restartBackend) throw new Error('GEA_ENVIRONMENT_SWITCH_UNAVAILABLE');
      const previous = getGeaEnvironment();
      const result = await saveGeaEnvironment(baseUrl, options);
      if (!result.changed && !runtimeUnavailable) {
        activateGeaEnvironment(result.environment);
        return result;
      }

      runtimeUnavailable = true;
      try {
        await suspendSharedGeaEnvironment();
        resetGeaClientEnvironment();
        await restartBackend(result.environment.baseUrl);
        activateGeaEnvironment(result.environment);
        resumeSharedGeaEnvironment(getPersonalModelGatewayRuntime());
        runtimeUnavailable = false;
        return result;
      } catch (error) {
        // The old login remains invalidated. Restore only the previous endpoint and
        // an unauthenticated runtime; a failed rollback keeps all auth entrypoints blocked.
        await options
          .persist({ baseUrl: previous.baseUrl, environmentId: previous.environmentId, revision: 1 })
          .catch(() => {});
        activateGeaEnvironment(previous);
        try {
          await restartBackend(previous.baseUrl);
          resumeSharedGeaEnvironment(getPersonalModelGatewayRuntime());
          runtimeUnavailable = false;
        } catch {
          // A later explicit switch retries runtime initialization, including the same address.
        }
        throw error;
      }
    });
  transition = pending;
  return pending;
}
