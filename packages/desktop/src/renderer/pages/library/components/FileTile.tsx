/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import type { LibraryAsset, LibraryFile } from '../types';
import { fileTypeOf } from '../libraryService';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import styles from './FileTile.module.css';

interface FileTileProps {
  file: LibraryFile;
  asset: LibraryAsset;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const FILE_ICON: Record<string, string> = {
  pptx: '🎞️',
  ppt: '🎞️',
  docx: '📄',
  doc: '📄',
  xlsx: '📊',
  xls: '📊',
  csv: '📊',
  pdf: '📑',
  md: '📝',
  txt: '📝',
  png: '🖼️',
  jpg: '🖼️',
  jpeg: '🖼️',
  gif: '🖼️',
  webp: '🖼️',
  svg: '🖼️',
  mmd: '🔀',
  mermaid: '🔀',
  mindmap: '🧠',
  py: '</>',
  ts: '</>',
  tsx: '</>',
  js: '</>',
  jsx: '</>',
  sh: '</>',
  html: '</>',
  css: '</>',
  json: '</>',
};

const LEFT_BG: Record<string, string> = {
  slide: 'var(--library-cover-slide-bg)',
  doc: 'var(--library-cover-doc-bg)',
  sheet: 'var(--library-cover-sheet-bg)',
  image: 'var(--library-cover-image-bg)',
  code: 'var(--library-cover-code-bg)',
  html: 'var(--library-cover-html-bg)',
};

const EXT_COLOR: Record<string, string> = {
  slide: 'var(--library-cover-slide)',
  doc: 'var(--library-cover-doc)',
  sheet: 'var(--library-cover-sheet)',
  image: 'var(--library-cover-image)',
  code: 'var(--library-cover-code)',
  html: 'var(--library-cover-html)',
};

const FileTile: React.FC<FileTileProps> = ({ file, asset, onClick, onContextMenu }) => {
  const { t } = useTranslation();
  const [imgFailed, setImgFailed] = useState(false);
  const ext = file.ext.toLowerCase();
  const type = fileTypeOf(ext);
  const icon = FILE_ICON[ext] ?? '📄';
  const leftBg = LEFT_BG[type] ?? 'var(--library-cover-doc-bg)';
  const extColor = EXT_COLOR[type] ?? 'var(--library-cover-doc)';
  const extLabel = ext.toUpperCase().slice(0, 5);
  const isCode = type === 'code' || type === 'html';
  const logoUrl = getAgentLogo(asset.agent) ?? getAgentLogo(asset.agentBackend);

  return (
    <Tooltip
      content={
        <span className={styles.tooltipContent}>
          {t('library.tooltip.from')}
          {asset.conversationName}
        </span>
      }
      position='bottom'
      mini
    >
      <div className={styles.tile} onClick={onClick} onContextMenu={onContextMenu}>
        <div className={styles.cover} style={{ background: leftBg }}>
          <span className={isCode ? styles.iconCode : styles.iconEmoji}>{icon}</span>
          <span className={styles.extBadge} style={{ background: extColor }}>
            {extLabel}
          </span>
        </div>
        <div className={styles.name} title={file.name}>
          {file.name}
        </div>
        <div className={styles.agentRow}>
          {logoUrl && !imgFailed ? (
            <img src={logoUrl} alt={asset.agent} className={styles.agentLogo} onError={() => setImgFailed(true)} />
          ) : (
            <span className={styles.agentDot} />
          )}
          <span className={styles.agentName}>{asset.agent}</span>
        </div>
      </div>
    </Tooltip>
  );
};

export default FileTile;
