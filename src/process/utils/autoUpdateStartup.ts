/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type AutoUpdateStartupEnv = Record<string, string | undefined>;

const isAutoUpdaterRuntimeDisabled = (env: AutoUpdateStartupEnv): boolean =>
  env.AIONUI_DISABLE_AUTO_UPDATE === '1' ||
  env.AIONUI_E2E_TEST === '1' ||
  env.CI === 'true' ||
  env.CI === '1' ||
  env.GITHUB_ACTIONS === 'true';

export const shouldInitializeAutoUpdater = (env: AutoUpdateStartupEnv = process.env): boolean =>
  !isAutoUpdaterRuntimeDisabled(env);

export const shouldRunAutomaticStartupUpdateCheck = (env: AutoUpdateStartupEnv = process.env): boolean =>
  shouldInitializeAutoUpdater(env) && env.AIONUI_AUTO_UPDATE_ON_STARTUP === '1';
