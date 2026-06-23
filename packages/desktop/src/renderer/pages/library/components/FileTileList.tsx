/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import type { LibraryAsset, LibraryFile } from '../types';
import { fileTypeOf } from '../libraryService';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import styles from './FileTileList.module.css';

interface FileTileListProps {
  file: LibraryFile;
  asset: LibraryAsset;
  onClick: () => void;
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

const EXT_BG: Record<string, string> = {
  slide: 'var(--library-cover-slide-bg)',
  doc: 'var(--library-cover-doc-bg)',
  sheet: 'var(--library-cover-sheet-bg)',
  image: 'var(--library-cover-image-bg)',
  code: 'var(--library-cover-code-bg)',
  html: 'var(--library-cover-html-bg)',
};

const FileTileList: React.FC<FileTileListProps> = ({ file, asset, onClick }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const ext = file.ext.toLowerCase();
  const type = fileTypeOf(ext);
  const icon = FILE_ICON[ext] ?? '📄';
  const extBg = EXT_BG[type] ?? 'var(--library-cover-doc-bg)';
  const isCode = type === 'code' || type === 'html';
  const logoUrl = getAgentLogo(asset.agent) ?? getAgentLogo(asset.agentBackend);

  return (
    <div className={styles.row} onClick={onClick}>
      {/* 左侧类型色块 */}
      <div className={styles.typeBlock} style={{ background: extBg }}>
        <span className={isCode ? styles.iconCode : styles.iconEmoji}>{icon}</span>
      </div>

      {/* 文件名 */}
      <div className={styles.nameWrap}>
        <span className={styles.name} title={file.name}>
          {file.name}
        </span>
      </div>

      {/* agent */}
      <div className={styles.agentWrap}>
        {logoUrl && !imgFailed ? (
          <img src={logoUrl} alt={asset.agent} className={styles.agentLogo} onError={() => setImgFailed(true)} />
        ) : (
          <span className={styles.agentDot} />
        )}
        <span className={styles.agentName}>{asset.agent}</span>
      </div>
    </div>
  );
};

export default FileTileList;
