/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveBackendAssetUrl } from '@/renderer/utils/platform';
import siderBrandIcon from '@/renderer/assets/logos/brand/sider-brand.png';

export type AssistantAvatar =
  | { kind: 'image'; value: string }
  | { kind: 'emoji'; value: string }
  | { kind: 'fallback' };

type AssistantAvatarIdentity = {
  id?: string | null;
  source?: string | null;
  backend?: string | null;
};

export function isBackendRelativeAssetPath(value: string): boolean {
  return value.startsWith('/api/') || value.startsWith('/assets/');
}

export function isLikelyLocalFilePath(value: string): boolean {
  if (value.startsWith('file://')) return true;
  if (/^[A-Za-z]:[\\/]/.test(value)) return true;
  if (/^\/[A-Za-z]:[\\/]/.test(value)) return true;

  const unixLocalPathPrefixes = ['/Users/', '/home/', '/var/', '/tmp/', '/private/', '/Volumes/', '/mnt/'];
  return unixLocalPathPrefixes.some((prefix) => value.startsWith(prefix));
}

export function resolveAssistantAvatar(avatar: string | undefined): AssistantAvatar {
  const value = avatar?.trim();
  if (!value) return { kind: 'fallback' };

  if (isLikelyLocalFilePath(value)) {
    return { kind: 'fallback' };
  }
  if (value.startsWith('/') && !isBackendRelativeAssetPath(value)) {
    return { kind: 'fallback' };
  }

  const resolved = resolveBackendAssetUrl(value) ?? value;
  const isImage = /\.(svg|png|jpe?g|webp|gif)$/i.test(resolved) || /^(https?:|data:|\/)/i.test(resolved);
  if (isImage) {
    return { kind: 'image', value: resolved };
  }

  return { kind: 'emoji', value };
}

/**
 * Keep the product's default Aion CLI identity aligned with the GEAUi brand.
 * User-created and builtin assistants backed by aionrs keep their own avatars.
 */
export function resolveAssistantDisplayAvatar(
  avatar: string | undefined,
  identity: AssistantAvatarIdentity
): AssistantAvatar {
  const id = identity.id?.trim().toLowerCase();
  const source = identity.source?.trim().toLowerCase();
  const backend = identity.backend?.trim().toLowerCase();
  const isDefaultAionCli = backend === 'aionrs' && (source === 'generated' || id === 'bare-aionrs' || (!id && !source));

  if (isDefaultAionCli) {
    return { kind: 'image', value: siderBrandIcon };
  }

  return resolveAssistantAvatar(avatar);
}
