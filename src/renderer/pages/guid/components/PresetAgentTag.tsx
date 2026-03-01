/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CUSTOM_AVATAR_IMAGE_MAP } from '../constants';
import type { AcpBackendConfig, AvailableAgent } from '../types';
import { IconClose } from '@arco-design/web-react/icon';
import { Robot } from '@icon-park/react';
import React from 'react';
import styles from '../index.module.css';

type PresetAgentTagProps = {
  agentInfo: AvailableAgent;
  customAgents: AcpBackendConfig[];
  localeKey: string;
  onClose: () => void;
};

const PresetAgentTag: React.FC<PresetAgentTagProps> = ({ agentInfo, customAgents, localeKey, onClose }) => {
  const avatarValue = agentInfo.avatar?.trim();
  const avatarImage = avatarValue ? CUSTOM_AVATAR_IMAGE_MAP[avatarValue] : undefined;
  const agent = customAgents.find((a) => a.id === agentInfo.customAgentId);
  const name = agent?.nameI18n?.[localeKey] || agent?.name || agentInfo.name;

  return (
    <div className={styles.presetAgentTag} onClick={() => {}}>
      {avatarImage ? <img src={avatarImage} alt='' width={16} height={16} style={{ objectFit: 'contain', flexShrink: 0 }} /> : avatarValue ? <span style={{ fontSize: 14, lineHeight: '16px', flexShrink: 0 }}>{avatarValue}</span> : <Robot theme='outline' size={16} style={{ flexShrink: 0 }} />}
      <span className={styles.presetAgentTagName}>{name}</span>
      <div
        className={styles.presetAgentTagClose}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <IconClose style={{ fontSize: 12, color: 'var(--color-text-3)' }} />
      </div>
    </div>
  );
};

export default PresetAgentTag;
