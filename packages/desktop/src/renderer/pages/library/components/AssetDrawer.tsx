/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer, Button } from '@arco-design/web-react';
import { Right } from '@icon-park/react';
import type { LibraryAsset } from '../types';
import { fileTypeOf } from '../libraryService';
import { formatDateTime, formatRelativeTime } from '../utils';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import styles from './AssetDrawer.module.css';

const EXT_BADGE_COLOR: Record<string, string> = {
  slide: '#c0522a',
  doc:   '#2e6abf',
  sheet: '#227a40',
  image: '#5838a0',
  code:  '#445566',
  html:  '#1a6e96',
};

function extBadgeColor(ext: string): string {
  const type = fileTypeOf(ext.toLowerCase());
  return EXT_BADGE_COLOR[type] ?? EXT_BADGE_COLOR.doc;
}

const DrawerAgentBadge: React.FC<{ agent: string; agentBackend: string }> = ({ agent, agentBackend }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const logoUrl = getAgentLogo(agent) ?? getAgentLogo(agentBackend);
  return (
    <span className={styles.agentBadge}>
      {logoUrl && !imgFailed ? (
        <img src={logoUrl} alt={agent} className={styles.agentLogo} onError={() => setImgFailed(true)} />
      ) : (
        <span className={styles.agentDot} />
      )}
      {agent}
    </span>
  );
};

interface AssetDrawerProps {
  asset: LibraryAsset | null;
  visible: boolean;
  onClose: () => void;
  onJumpToConversation: (conversationId: string) => void;
}

const AssetDrawer: React.FC<AssetDrawerProps> = ({ asset, visible, onClose, onJumpToConversation }) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const drawerWidth = isMobile ? '100vw' : 480;

  const titleNode = (
    <div style={{
      wordBreak: 'break-word',
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    }}>
      {asset?.conversationName || ''}
    </div>
  );

  return (
    <Drawer
      width={drawerWidth}
      title={titleNode}
      visible={visible}
      onCancel={onClose}
      autoFocus={false}
      className={styles.drawer}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <Button onClick={onClose}>{t('library.drawer.close')}</Button>
          <Button
            type='primary'
            disabled={!asset}
            icon={<Right theme='outline' size='14' fill='currentColor' />}
            onClick={() => asset && onJumpToConversation(asset.conversationId)}
          >
            {t('library.drawer.viewInConversation')}
          </Button>
        </div>
      }
    >
      {asset && (
        <>
          <div className={styles.metaCard}>
            <div className={styles.metaGrid}>
              <span className={styles.metaKey}>{t('library.drawer.createdAt')}</span>
              <span className={styles.metaValue}>{formatDateTime(asset.createdAt)}</span>

              <span className={styles.metaKey}>{t('library.drawer.updatedAt')}</span>
              <span className={styles.metaValue}>
                {formatDateTime(asset.updatedAt)} · {formatRelativeTime(t, asset.updatedAt)}
              </span>

              <span className={styles.metaKey}>{t('library.drawer.agent')}</span>
              <span className={styles.metaValue}>
                <DrawerAgentBadge agent={asset.agent} agentBackend={asset.agentBackend} />
              </span>

              <div className={styles.metaFullRow}>
                <span className={styles.metaKey}>{t('library.drawer.prompt')}</span>
                <div className={styles.metaPrompt}>{asset.prompt}</div>
              </div>
            </div>
          </div>
          <div className={styles.sectionTitle}>{t('library.fileCount', { count: asset.files.length })}</div>
          {asset.files.map((f) => (
            <div key={f.path} className={styles.fileRow}>
              <span
                className={styles.fileExtBadge}
                style={{ background: extBadgeColor(f.ext) }}
              >
                {f.ext.toUpperCase().slice(0, 4)}
              </span>
              <div className={styles.fileMeta}>
                <div className={styles.fileName}>{f.name}</div>
                <div className={styles.fileSub}>{f.size}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </Drawer>
  );
};

export default AssetDrawer;
