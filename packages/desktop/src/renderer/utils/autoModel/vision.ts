/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatFileRef } from '@/common/types/chatFile';
import { chatFileRefPath } from '@/common/types/chatFile';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';

/** True when any attachment is an image (vision-capable model required). */
export const chatFileRefsRequireVision = (files: ChatFileRef[]): boolean =>
  files.some((file) => getFileTypeInfo(chatFileRefPath(file)).contentType === 'image');
