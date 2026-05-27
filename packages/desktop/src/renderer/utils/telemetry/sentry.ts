/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveDesktopSentryConfig } from '@/common/config/sentry';

export const desktopSentryConfig = resolveDesktopSentryConfig(process.env as Record<string, string | undefined>);

export const isDesktopSentryEnabled = () => desktopSentryConfig.enabled && Boolean(window.electronAPI);
