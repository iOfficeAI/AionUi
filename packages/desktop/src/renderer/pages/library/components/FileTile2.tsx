/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tooltip } from '@arco-design/web-react';
import type { LibraryAsset, LibraryFile } from '../types';
import { fileTypeOf } from '../libraryService';
import styles from './FileTile2.module.css';

interface FileTile2Props {
  file: LibraryFile;
  asset: LibraryAsset;
  onClick: () => void;
}

function iconFor(file: LibraryFile): { variant?: string; emoji?: string; text?: string } {
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

const FileTile2: React.FC<FileTile2Props> = ({ file, asset, onClick }) => {
  const icon = iconFor(file);
  return (
    <Tooltip
      content={<span className={styles.tooltipContent}>来自：{asset.conversationName}</span>}
      position='bottom'
      mini
    >
      <div className={styles.tile} onClick={onClick}>
        {icon.emoji ? (
          <div className={`${styles.icon} ${styles.iconEmoji}`}>{icon.emoji}</div>
        ) : (
          <div
            className={`${styles.icon} ${icon.variant ? styles[icon.variant as keyof typeof styles] : ''} ${icon.text === '</>' ? styles.codeSymbol : ''}`}
          >
            {icon.text}
          </div>
        )}
        <div className={styles.name} title={file.name}>
          {file.name}
        </div>
        <div className={styles.agent}>{asset.agent}</div>
      </div>
    </Tooltip>
  );
};

export default FileTile2;
