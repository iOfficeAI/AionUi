/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import { useThemeDetection } from '@/renderer/pages/conversation/Preview/hooks/useThemeDetection';
import { getFileIconName, getFolderIconName, ICON_PREFIX_DARK, ICON_PREFIX_LIGHT } from './fileIcon';
import { addCollection, Icon, type IconifyJSON } from '@iconify/react';
import React from 'react';
import catppuccinLatte from './catppuccinLatte.json';
import catppuccinMacchiato from './catppuccinMacchiato.json';

// Register both bundled catppuccin flavors once, so <Icon> resolves names
// offline without hitting the Iconify API. Intentional, isolated deviation from
// the @icon-park-only icon convention (see AGENTS.md): the file tree uses the
// catppuccin file-icon theme for a softer, uniform look. The two flavors share
// identical icon names — only the palette (and thus the prefix) differs, picked
// by the active theme so neutral icons don't wash out on a light background.
addCollection(catppuccinLatte as IconifyJSON);
addCollection(catppuccinMacchiato as IconifyJSON);

const ICON_SIZE = 16;

type FileTypeIconProps = {
  node: Pick<IDirOrFile, 'name' | 'relativePath' | 'isFile'>;
  /** Whether the folder node is currently expanded (ignored for files). */
  expanded?: boolean;
};

/**
 * File-tree leading icon rendered with the "catppuccin" file-icon theme: a
 * colored per-type icon for files and an open/closed folder icon for directories.
 */
const FileTypeIcon: React.FC<FileTypeIconProps> = ({ node, expanded }) => {
  // Pick the catppuccin flavor from the active appearance (data-theme on <html>,
  // written as 'light'/'dark' by applyTheme — so custom themes resolve correctly
  // too). Reads the DOM signal rather than the theme context so the file-tree row
  // needs no ThemeProvider wrapper.
  const appearance = useThemeDetection();
  const prefix = appearance === 'dark' ? ICON_PREFIX_DARK : ICON_PREFIX_LIGHT;
  const isFolder = !node.isFile;
  const name = isFolder ? getFolderIconName(Boolean(expanded)) : getFileIconName(node);

  return (
    <span
      data-testid={isFolder ? 'file-type-icon-folder' : 'file-type-icon-file'}
      className='inline-flex items-center justify-center flex-shrink-0'
      style={{ width: ICON_SIZE, height: ICON_SIZE, lineHeight: 0 }}
    >
      <Icon icon={`${prefix}:${name}`} width={ICON_SIZE} height={ICON_SIZE} />
    </span>
  );
};

export default FileTypeIcon;
