/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import {
  DEFAULT_EXPERIENCE_MODE,
  normalizeExperienceMode,
  type ExperienceMode,
} from '@/common/types/ui/experienceMode';
import { useCallback, useEffect, useState } from 'react';

export function useExperienceMode() {
  const [mode, setMode] = useState<ExperienceMode>(() =>
    normalizeExperienceMode(configService.get('ui.experienceMode') ?? DEFAULT_EXPERIENCE_MODE)
  );

  useEffect(() => {
    return configService.subscribe('ui.experienceMode', (value) => {
      setMode(normalizeExperienceMode(value ?? DEFAULT_EXPERIENCE_MODE));
    });
  }, []);

  const setExperienceMode = useCallback(async (next: ExperienceMode) => {
    await configService.set('ui.experienceMode', next);
  }, []);

  const isOfficeMode = mode !== 'power';

  return {
    mode,
    isOfficeMode,
    setExperienceMode,
  };
}
