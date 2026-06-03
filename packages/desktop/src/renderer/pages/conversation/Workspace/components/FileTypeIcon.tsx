/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import {
  getFileIconName,
  getFolderIconName,
  ICON_PREFIX,
} from '@/renderer/pages/conversation/Workspace/utils/fileIcon';
import { addCollection, Icon, type IconifyJSON } from '@iconify/react';
import React from 'react';
import vscodeIconsData from '../utils/vscodeIconsData.json';

// Register only the bundled subset of vscode-icons once, so <Icon> resolves
// names offline without hitting the Iconify API. Intentional, isolated
// deviation from the @icon-park-only icon convention (see AGENTS.md): the file
// tree mirrors VSCode's explorer icons.
addCollection(vscodeIconsData as IconifyJSON);

const ICON_SIZE = 16;

type FileTypeIconProps = {
  node: Pick<IDirOrFile, 'name' | 'relativePath' | 'isFile'>;
  /** Whether the folder node is currently expanded (ignored for files). */
  expanded?: boolean;
};

/**
 * File-tree leading icon rendered with VSCode's "vscode-icons" theme: a colored
 * per-type icon for files and an open/closed folder icon for directories.
 */
const FileTypeIcon: React.FC<FileTypeIconProps> = ({ node, expanded }) => {
  const isFolder = !node.isFile;
  const name = isFolder ? getFolderIconName(Boolean(expanded)) : getFileIconName(node);

  return (
    <span
      data-testid={isFolder ? 'file-type-icon-folder' : 'file-type-icon-file'}
      className='inline-flex items-center justify-center flex-shrink-0'
      style={{ width: ICON_SIZE, height: ICON_SIZE, lineHeight: 0 }}
    >
      <Icon icon={`${ICON_PREFIX}:${name}`} width={ICON_SIZE} height={ICON_SIZE} />
    </span>
  );
};

export default FileTypeIcon;
