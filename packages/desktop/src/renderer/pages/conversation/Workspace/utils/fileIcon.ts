/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { getFileExtension } from '@/renderer/pages/conversation/Preview/fileUtils';
import { defaultStyles, type FileIconProps } from 'react-file-icon';

type IconNode = Pick<IDirOrFile, 'name' | 'relativePath'>;

/**
 * Resolve the lowercase extension used to pick a react-file-icon style.
 * Prefers the node name, falling back to its relative path.
 */
export const getNodeIconExtension = (node: IconNode): string => {
  return getFileExtension(node.name || node.relativePath || '');
};

/**
 * Look up the react-file-icon style for an extension. Unknown/empty
 * extensions return an empty object, which renders a generic file icon.
 */
export const getFileIconStyle = (ext: string): FileIconProps => {
  if (!ext) return {};
  const styles = defaultStyles as Record<string, FileIconProps>;
  return styles[ext] ?? {};
};
