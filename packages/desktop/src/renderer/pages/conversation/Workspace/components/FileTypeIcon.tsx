/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { getFileIconStyle, getNodeIconExtension } from '@/renderer/pages/conversation/Workspace/utils/fileIcon';
import { Folder, FolderOpen } from '@icon-park/react';
import React from 'react';
import { FileIcon } from 'react-file-icon';

const ICON_SIZE = 16;
// react-file-icon renders a 40x48 SVG at full container width, so a 16px-wide
// box would be ~19px tall. Constrain width so its height matches ICON_SIZE and
// file rows stay the same height as folder rows.
const FILE_ICON_WIDTH = Math.round((ICON_SIZE * 40) / 48);

type FileTypeIconProps = {
  node: Pick<IDirOrFile, 'name' | 'relativePath' | 'isFile'>;
  /** Whether the folder node is currently expanded (ignored for files). */
  expanded?: boolean;
};

/**
 * File-tree leading icon. Folders use @icon-park/react; files use
 * react-file-icon (VSCode/seti-style colored icons). Intentional, isolated
 * deviation from the @icon-park-only icon convention (see AGENTS.md).
 */
const FileTypeIcon: React.FC<FileTypeIconProps> = ({ node, expanded }) => {
  if (!node.isFile) {
    const FolderGlyph = expanded ? FolderOpen : Folder;
    return (
      <span
        data-testid='file-type-icon-folder'
        className='inline-flex items-center justify-center flex-shrink-0'
        style={{ width: ICON_SIZE, height: ICON_SIZE, lineHeight: 0 }}
      >
        <FolderGlyph size={ICON_SIZE} fill='currentColor' />
      </span>
    );
  }

  const ext = getNodeIconExtension(node);
  const style = getFileIconStyle(ext);

  return (
    <span
      data-testid='file-type-icon-file'
      className='inline-flex items-center justify-center flex-shrink-0'
      style={{ width: FILE_ICON_WIDTH, height: ICON_SIZE, lineHeight: 0 }}
    >
      <FileIcon extension={ext || undefined} {...style} />
    </span>
  );
};

export default FileTypeIcon;
