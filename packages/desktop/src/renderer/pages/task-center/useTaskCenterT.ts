/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { useTranslation } from 'react-i18next';

/**
 * Returns a `t` function that always resolves keys against the `zh-CN`
 * locale regardless of the user's global language setting. The task center
 * UI ships Chinese-only; the global app language does not apply here.
 */
export const useTaskCenterT = (): ((key: string, options?: Record<string, unknown>) => string) => {
  const { t } = useTranslation();
  return (key: string, options?: Record<string, unknown>) => {
    const result = t(key, { ...options, lng: 'zh-CN' });
    return typeof result === 'string' ? result : key;
  };
};
