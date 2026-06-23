/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import classNames from 'classnames';
import type { LibraryFile } from '../types';
import { fileTypeOf } from '../libraryService';
import FileIcon from './FileIcon';
import styles from './AssetCover.module.css';

interface AssetCoverProps {
  file: LibraryFile;
  size?: 'normal' | 'small' | 'tiny';
}

interface CoverConfig {
  variant: keyof typeof styles;
  content: React.ReactNode;
}

function coverConfigFor(file: LibraryFile): CoverConfig {
  const type = fileTypeOf(file.ext);
  const ext = file.ext.toLowerCase();
  if (type === 'slide') return { variant: 'slide', content: <span className={styles.symbol}>PPT</span> };
  if (ext === 'md') return { variant: 'doc', content: <span className={styles.emoji}>📝</span> };
  if (type === 'doc') return { variant: 'doc', content: <span className={styles.symbol}>DOC</span> };
  if (type === 'sheet') return { variant: 'sheet', content: <span className={styles.symbol}>XLS</span> };
  if (ext === 'mmd' || ext === 'mermaid')
    return { variant: 'mermaid', content: <span className={styles.emoji}>🔀</span> };
  if (ext === 'mindmap') return { variant: 'mindmap', content: <span className={styles.emoji}>🧠</span> };
  if (type === 'image') return { variant: 'image', content: <span className={styles.emoji}>🖼️</span> };
  if (type === 'code')
    return { variant: 'code', content: <span className={classNames(styles.symbol, styles.codeSymbol)}>{'</>'}</span> };
  return { variant: 'doc', content: <span className={styles.symbol}>DOC</span> };
}

const AssetCover: React.FC<AssetCoverProps> = ({ file, size = 'normal' }) => {
  // tiny mode: use Finder-style SVG file icon
  if (size === 'tiny') {
    return <FileIcon ext={file.ext} size={40} />;
  }

  const { variant, content } = coverConfigFor(file);
  return <div className={classNames(styles.cover, styles[variant], size === 'small' && styles.small)}>{content}</div>;
};

export default AssetCover;
