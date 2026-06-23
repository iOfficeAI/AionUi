/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { Drawer, Button } from '@arco-design/web-react';
import { Right } from '@icon-park/react';
import { ipcBridge } from '@/common';
import type { LibraryAsset, LibraryFile } from '../types';
import { fileTypeOf } from '../libraryService';
import { formatDateTime, formatRelativeTime } from '../utils';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { isWindows, isLinux } from '@renderer/utils/platform';
import styles from './AssetDrawer.module.css';

function showInFolderKey(): string {
  if (isWindows()) return 'library.drawer.showInExplorer';
  if (isLinux()) return 'library.drawer.showInFileManager';
  return 'library.drawer.showInFinder';
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

const EXT_COLOR: Record<string, string> = {
  slide: '#c0522a',
  doc: '#2e6abf',
  sheet: '#227a40',
  image: '#5838a0',
  code: '#445566',
  html: '#1a6e96',
};

const AgentBadge: React.FC<{ agent: string; agentBackend: string }> = ({ agent, agentBackend }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const logoUrl = getAgentLogo(agent) ?? getAgentLogo(agentBackend);
  return (
    <span className={styles.agentBadge}>
      {logoUrl && !imgFailed ? (
        <img src={logoUrl} alt={agent} className={styles.agentLogo} onError={() => setImgFailed(true)} />
      ) : (
        <span className={styles.agentDot} />
      )}
      <span>{agent}</span>
    </span>
  );
};

interface AssetDrawerProps {
  asset: LibraryAsset | null;
  file: LibraryFile | null;
  visible: boolean;
  onClose: () => void;
  onJumpToConversation: (conversationId: string, filePath?: string) => void;
}

const AssetDrawer: React.FC<AssetDrawerProps> = ({ asset, file, visible, onClose, onJumpToConversation }) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const drawerWidth = isMobile ? '100vw' : 480;
  const [otherFilesOpen, setOtherFilesOpen] = React.useState(false);

  const otherFiles = asset ? asset.files.filter((f) => f.path !== file?.path) : [];

  const ext = file?.ext.toLowerCase() ?? '';
  const type = fileTypeOf(ext);
  const icon = FILE_ICON[ext] ?? '📄';
  const extColor = EXT_COLOR[type] ?? EXT_COLOR.doc;
  const extLabel = ext.toUpperCase().slice(0, 5);
  const isCode = type === 'code' || type === 'html';

  return (
    <Drawer
      width={drawerWidth}
      title={null}
      visible={visible}
      onCancel={onClose}
      autoFocus={false}
      className={styles.drawer}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <Button disabled={!file} onClick={() => file && ipcBridge.shell.showItemInFolder.invoke(file.path)}>
            {t(showInFolderKey())}
          </Button>
          <Button
            type='primary'
            disabled={!asset}
            icon={<Right theme='outline' size='14' fill='currentColor' />}
            onClick={() => asset && onJumpToConversation(asset.conversationId, file?.path)}
          >
            {t('library.drawer.viewInConversation')}
          </Button>
        </div>
      }
    >
      {asset && file && (
        <>
          {/* 文件主角区 */}
          <div className={styles.fileHero}>
            <div className={styles.fileHeroIcon}>
              <span className={isCode ? styles.heroIconCode : styles.heroIconEmoji}>{icon}</span>
              <span className={styles.heroExtBadge} style={{ background: extColor }}>
                {extLabel}
              </span>
            </div>
            <div className={styles.fileHeroMeta}>
              <div className={styles.fileHeroName} title={file.name}>
                {file.name}
              </div>
              <div className={styles.fileHeroSub}>
                {file.size} · {formatRelativeTime(t, asset.updatedAt)}
              </div>
            </div>
          </div>

          <div className={styles.divider} />

          {/* 来自对话 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>{t('library.drawer.fromConversation')}</div>
            <div className={styles.conversationCard}>
              <div className={styles.conversationName}>{asset.conversationName}</div>
              <div className={styles.conversationMeta}>
                <AgentBadge agent={asset.agent} agentBackend={asset.agentBackend} />
                <span className={styles.dot}>·</span>
                <span className={styles.conversationTime}>{formatDateTime(asset.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* 生成自 — 仅在 prompt 与对话名不同时显示 */}
          {asset.prompt && asset.prompt.trim() !== asset.conversationName.trim() && (
            <>
              <div className={styles.divider} />
              <div className={styles.section}>
                <div className={styles.sectionLabel}>{t('library.drawer.generatedFrom')}</div>
                <div className={styles.prompt}>{asset.prompt}</div>
              </div>
            </>
          )}

          {/* 同对话其他文件 — 默认收起 */}
          {otherFiles.length > 0 && (
            <>
              <div className={styles.divider} />
              <div className={styles.section}>
                <button type='button' className={styles.collapseToggle} onClick={() => setOtherFilesOpen((v) => !v)}>
                  <span className={styles.sectionLabel} style={{ margin: 0 }}>
                    {t('library.drawer.alsoInConversation')}
                    <span className={styles.otherCount}>{otherFiles.length}</span>
                  </span>
                  <span className={classNames(styles.chevron, otherFilesOpen && styles.chevronOpen)}>›</span>
                </button>
                {otherFilesOpen && (
                  <div className={styles.otherFileList}>
                    {otherFiles.map((f) => {
                      const fExt = f.ext.toLowerCase();
                      const fType = fileTypeOf(fExt);
                      const fIcon = FILE_ICON[fExt] ?? '📄';
                      const fColor = EXT_COLOR[fType] ?? EXT_COLOR.doc;
                      const fLabel = fExt.toUpperCase().slice(0, 5);
                      const fIsCode = fType === 'code' || fType === 'html';
                      return (
                        <div key={f.path} className={styles.otherFileRow}>
                          <div className={styles.otherFileIcon}>
                            <span className={fIsCode ? styles.otherIconCode : styles.otherIconEmoji}>{fIcon}</span>
                            <span className={styles.otherExtBadge} style={{ background: fColor }}>
                              {fLabel}
                            </span>
                          </div>
                          <span className={styles.otherFileName} title={f.name}>
                            {f.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Drawer>
  );
};

export default AssetDrawer;
