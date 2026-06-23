/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { More } from '@icon-park/react';
import type { LibraryAsset, LibraryFileType } from '../types';
import { fileTypeOf } from '../libraryService';
import { formatRelativeTime } from '../utils';
import { useIsDark } from '../useIsDark';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import styles from './AssetCard.module.css';

interface AssetCardProps {
  asset: LibraryAsset;
  activeTab?: 'all' | LibraryFileType;
  /** When set, this specific file is always used as the cover (file-view mode). */
  coverFilePath?: string;
  onOpen: () => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: () => void;
  onMenuClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
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

// Brand colors for known agents [light, dark] — used as pill border + text + dot color
const AGENT_PILL_COLOR: Record<string, [string, string]> = {
  claude: ['#e8500a', '#f08060'],
  codex: ['#444444', '#a0a8b0'],
  gemini: ['#4285f4', '#7aaff8'],
  qwen: ['#6b21a8', '#b07de0'],
  kimi: ['#0ea5e9', '#5cc8f8'],
  copilot: ['#1f883d', '#4db870'],
  goose: ['#f59e0b', '#fbbf40'],
  cursor: ['#8b5cf6', '#b48ef9'],
};

// Deterministic fallback colors [light, dark]
const FALLBACK_COLORS: [string, string][] = [
  ['#2563eb', '#6090f0'],
  ['#7c3aed', '#b07de0'],
  ['#0891b2', '#3cc0d8'],
  ['#059669', '#34c98a'],
  ['#d97706', '#f0a830'],
  ['#dc2626', '#f06060'],
  ['#db2777', '#f070a8'],
  ['#65a30d', '#90cc30'],
];

function agentPillColor(agent: string, isDark: boolean): string {
  const known = AGENT_PILL_COLOR[agent.toLowerCase()];
  const pair =
    known ??
    (() => {
      let hash = 0;
      for (let i = 0; i < agent.length; i++) {
        hash = (hash * 31 + agent.charCodeAt(i)) >>> 0;
      }
      return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
    })();
  return isDark ? pair[1] : pair[0];
}

const AgentPill: React.FC<{ agent: string; agentBackend: string; isDark: boolean }> = ({
  agent,
  agentBackend,
  isDark,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const logoUrl = getAgentLogo(agent) ?? getAgentLogo(agentBackend);
  const color = agentPillColor(agentBackend, isDark) ?? agentPillColor(agent, isDark);

  return (
    <span className={styles.pill} style={{ '--pill-color': color } as React.CSSProperties}>
      {logoUrl && !imgFailed ? (
        <img src={logoUrl} alt={agent} className={styles.pillLogo} onError={() => setImgFailed(true)} />
      ) : (
        <span className={styles.pillDot} />
      )}
      <span className={styles.pillName}>{agent}</span>
    </span>
  );
};

const AssetCard: React.FC<AssetCardProps> = ({
  asset,
  activeTab = 'all',
  coverFilePath,
  onOpen,
  onMouseEnter,
  onMouseLeave,
  onMenuClick,
}) => {
  const { t } = useTranslation();
  const isDark = useIsDark();

  const coverFile = coverFilePath
    ? (asset.files.find((f) => f.path === coverFilePath) ?? asset.files[0])
    : activeTab !== 'all'
      ? (asset.files.find((f) => fileTypeOf(f.ext) === activeTab) ?? asset.files[0])
      : asset.files[0];

  const ext = coverFile.ext.toLowerCase();
  const type = fileTypeOf(ext);
  const icon = FILE_ICON[ext] ?? '📄';
  const leftBg = LEFT_BG[type] ?? 'var(--library-cover-doc-bg)';
  const extColor = EXT_COLOR[type] ?? 'var(--library-cover-doc)';
  const extLabel = ext.toUpperCase().slice(0, 5);
  const extraCount = asset.files.length - 1;

  return (
    <div className={styles.card} onClick={onOpen} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className={styles.left} style={{ background: leftBg }}>
        <span className={type === 'code' || type === 'html' ? styles.leftIconCode : styles.leftIcon}>{icon}</span>
        <span className={styles.extBadge} style={{ background: extColor }}>
          {extLabel}
        </span>
      </div>

      <div className={styles.right}>
        <div className={styles.fileRow}>
          <span className={styles.fileName}>{coverFile.name}</span>
          {extraCount > 0 && <span className={styles.fileMore}>+{extraCount}</span>}
        </div>
        <div className={styles.convTitle}>{asset.conversationName}</div>
        <div className={styles.bottomRow}>
          <AgentPill agent={asset.agent} agentBackend={asset.agentBackend} isDark={isDark} />
          <span className={styles.time}>{formatRelativeTime(t, asset.updatedAt)}</span>
        </div>
      </div>

      <div
        className={styles.menu}
        onClick={(e) => {
          e.stopPropagation();
          onMenuClick?.(e);
        }}
      >
        <More theme='outline' size='14' fill='currentColor' />
      </div>
    </div>
  );
};

export default AssetCard;
