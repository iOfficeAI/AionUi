/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import classNames from 'classnames';
import type { LibraryAsset, LibraryFile } from '../types';
import { fileTypeOf } from '../libraryService';
import styles from './FileTile.module.css';

interface FileTileProps {
  file: LibraryFile;
  asset: LibraryAsset;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

interface TileIcon {
  variant?: keyof typeof styles;
  emoji?: string;
  text?: string;
}

function iconFor(file: LibraryFile): TileIcon {
  const type = fileTypeOf(file.ext);
  const ext = file.ext.toLowerCase();
  if (type === 'slide') return { variant: 'slide', text: 'PPT' };
  if (ext === 'md') return { emoji: '📝' };
  if (type === 'doc') return { variant: 'doc', text: 'DOC' };
  if (type === 'sheet') return { variant: 'sheet', text: 'XLS' };
  if (ext === 'mmd' || ext === 'mermaid') return { emoji: '🔀' };
  if (ext === 'mindmap') return { emoji: '🧠' };
  if (type === 'image') return { emoji: '🖼️' };
  if (type === 'code') return { variant: 'code', text: '</>' };
  if (type === 'html') return { variant: 'html', text: 'HTML' };
  return { variant: 'doc', text: 'DOC' };
}

const FileTile: React.FC<FileTileProps> = ({ file, asset, onClick, onContextMenu }) => {
  const icon = iconFor(file);
  return (
    <div className={styles.tile} onClick={onClick} onContextMenu={onContextMenu}>
      {icon.emoji ? (
        <div className={classNames(styles.icon, styles.iconEmoji)}>{icon.emoji}</div>
      ) : (
        <div
          className={classNames(
            styles.icon,
            icon.variant && styles[icon.variant],
            icon.text === '</>' && styles.codeSymbol
          )}
        >
          {icon.text}
        </div>
      )}
      <div className={styles.name} title={file.name}>
        {file.name}
      </div>
      <div className={styles.meta}>{file.size}</div>
      <div className={styles.conv}>💬 {asset.conversationName}</div>
    </div>
  );
};

export default FileTile;
