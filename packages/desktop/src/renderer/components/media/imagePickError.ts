/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { TFunction } from 'i18next';

/**
 * 后端沙箱拒绝的错误码 / Backend error code for a sandbox rejection.
 *
 * `POST /api/fs/image-base64` answers 403 with this machine-readable `code`
 * whenever the requested path resolves outside the allowed roots (temp dir /
 * home dir / work dir). The native file dialog is free to hand back exactly
 * such a path — another drive, or a cloud-redirected Desktop — so this is the
 * most likely way an otherwise valid image fails to load.
 *
 * The same code is already consumed by `renderer/utils/previewError.ts`.
 */
const PATH_OUTSIDE_SANDBOX = 'PATH_OUTSIDE_SANDBOX';

/**
 * 把选图失败映射为提示文案 / Map an image-pick failure onto a display message.
 *
 * `error` is whatever the picker path produced: a `BackendHttpError` thrown by
 * the HTTP bridge, some other thrown value, or `null` when the call resolved
 * but handed back an empty payload.
 *
 * Only the sandbox rejection gets a specific, actionable message, because it is
 * the only case the backend guarantees a stable `code` for. Everything else
 * falls back to the generic failure text on purpose — matching against error
 * message strings would be guesswork, and a wrong-but-specific message is worse
 * than an honest generic one.
 */
export const getImagePickErrorMessage = (error: unknown, t: TFunction): string => {
  if (isBackendHttpError(error) && error.code === PATH_OUTSIDE_SANDBOX) {
    return t('settings.imagePickOutsideSandbox', {
      defaultValue: 'This location is not accessible. Pick an image under your home directory or workspace.',
    });
  }
  return t('common.failed', { defaultValue: 'Failed' });
};
