/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import type { LibraryAsset } from '../types';
import { fileTypeOf } from '../libraryService';
import { useIsDark } from '../useIsDark';
import styles from './AssetPopover.module.css';

interface AssetPopoverProps {
  asset: LibraryAsset | null;
  anchorRect: DOMRect | null;
  containerRect: DOMRect | null;
  containerScrollTop: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFileClick?: (fileName: string) => void;
}

const POPOVER_WIDTH = 320;
const GAP = 12;

function fileTagColor(ext: string, isDark: boolean): string {
  const e = ext.toLowerCase();
  const type = fileTypeOf(e);
  if (type === 'slide') return isDark ? '#f09060' : '#ff7a45';
  if (type === 'sheet') return isDark ? '#6dd845' : '#52c41a';
  if (type === 'image') {
    if (e === 'mmd' || e === 'mermaid') return isDark ? '#f06ab0' : '#eb2f96';
    if (e === 'mindmap') return isDark ? '#20c8cc' : '#08979c';
    return isDark ? '#a060e8' : '#722ed1';
  }
  if (type === 'html') return isDark ? '#50b8e8' : '#1890c0';
  if (type === 'code') return isDark ? '#8090a0' : '#595959';
  return isDark ? '#4898f8' : '#1677ff';
}

const AssetPopover: React.FC<AssetPopoverProps> = ({
  asset,
  anchorRect,
  containerRect,
  containerScrollTop,
  onMouseEnter,
  onMouseLeave,
  onFileClick,
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const isDark = useIsDark();

  useEffect(() => {
    if (asset && anchorRect) {
      // Wait one tick so the popover mounts before transitioning into view.
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    return undefined;
  }, [asset, anchorRect]);

  if (!asset || !anchorRect || !containerRect) return null;

  let left: number;
  if (anchorRect.right + GAP + POPOVER_WIDTH <= window.innerWidth) {
    left = anchorRect.right - containerRect.left + GAP;
  } else {
    left = anchorRect.left - containerRect.left - POPOVER_WIDTH - GAP;
  }
  // anchorRect and containerRect are both viewport-relative (getBoundingClientRect).
  // The popover is position:absolute inside the scrollable container, so we must
  // add containerScrollTop to convert viewport offset → scroll-adjusted offset.
  const top = anchorRect.top - containerRect.top + containerScrollTop;

  return (
    <div
      className={classNames(styles.popover, visible && styles.show)}
      style={{ left, top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={styles.prompt}>{asset.prompt}</div>
      <div className={styles.sectionTitle}>{t('library.fileCount', { count: asset.files.length })}</div>
      {asset.files.map((f) => (
        <div
          key={f.path}
          className={styles.fileRow}
          onClick={(e) => {
            e.stopPropagation();
            onFileClick?.(f.name);
          }}
        >
          <span className={styles.fileTag} style={{ background: fileTagColor(f.ext, isDark) }}>
            {f.ext.toUpperCase().slice(0, 4)}
          </span>
          <span className={styles.fileName}>{f.name}</span>
        </div>
      ))}
    </div>
  );
};

export default AssetPopover;
