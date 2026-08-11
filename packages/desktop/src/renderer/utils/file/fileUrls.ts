/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getBaseUrl } from '@/common/adapter/httpBridge';
import type { ChatFileRef } from '@/common/types/chatFile';

/** Build the raw-byte stream URL for a renderer-safe file reference. */
export const buildFileStreamUrl = (ref: ChatFileRef): string => {
  const params = new URLSearchParams({ kind: ref.kind });
  if (ref.kind === 'project') {
    params.set('pe_id', ref.pe_id);
    params.set('relative_path', ref.relative_path);
  } else {
    params.set('path', ref.path);
  }
  return `${getBaseUrl()}/api/fs/stream?${params.toString()}`;
};
