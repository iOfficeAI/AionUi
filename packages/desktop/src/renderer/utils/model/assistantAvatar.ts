/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CUSTOM_AVATAR_IMAGE_MAP } from '@/renderer/pages/guid/constants';
import { resolveBackendAssetUrl } from '@/renderer/utils/platform';

export type AssistantAvatar =
  | { kind: 'image'; value: string }
  | { kind: 'emoji'; value: string }
  | { kind: 'fallback' };

export function resolveAssistantAvatar(avatar: string | undefined): AssistantAvatar {
  const value = avatar?.trim();
  if (!value) return { kind: 'fallback' };

  const mapped = CUSTOM_AVATAR_IMAGE_MAP[value];
  if (mapped) {
    return { kind: 'image', value: mapped };
  }

  const resolved = resolveBackendAssetUrl(value) ?? value;
  const isImage = /\.(svg|png|jpe?g|webp|gif)$/i.test(resolved) || /^(https?:|file:\/\/|data:|\/)/i.test(resolved);
  if (isImage) {
    return { kind: 'image', value: resolved };
  }

  return { kind: 'emoji', value };
}
