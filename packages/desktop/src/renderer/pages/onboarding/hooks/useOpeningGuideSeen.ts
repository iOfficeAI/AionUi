/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { useCallback } from 'react';

const GUIDE_SEEN_KEY = 'onboarding.openingGuideSeen_v1' as const;

/**
 * Read/write the one-shot "opening guide already shown" flag. Persisted through
 * the existing client-settings store (`/api/settings/client`) — a pure
 * renderer-layer concern that does not touch aionCore. `configService` is
 * initialized before the app renders, so `get` is synchronous here.
 */
export const isOpeningGuideSeen = (): boolean => configService.get(GUIDE_SEEN_KEY) === true;

export const useMarkOpeningGuideSeen = (): (() => void) =>
  useCallback(() => {
    void configService.set(GUIDE_SEEN_KEY, true).catch((error) => {
      console.error('[onboarding] failed to persist opening guide flag:', error);
    });
  }, []);
