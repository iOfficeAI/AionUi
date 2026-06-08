/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as monaco from '@aionui/editor-monaco';
import type { OpenBuffer } from './types';

const PATH_SEPARATOR_RE = /[\\:]/g;

export const uriForBuffer = (buffer: OpenBuffer): monaco.Uri => {
  if (buffer.filePath) {
    const normalized = buffer.filePath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, '/$1:');
    return monaco.Uri.parse(`file://${normalized.startsWith('/') ? '' : '/'}${normalized}`);
  }
  return monaco.Uri.parse(`inmemory://untitled/${buffer.key.replace(PATH_SEPARATOR_RE, '_')}`);
};
