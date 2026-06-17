/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlarmClock, FileText, FolderOpen, Form, MessageOne, Ppt } from '@icon-park/react';
import React from 'react';
import { iconColors } from '@/renderer/styles/colors';
import type { OfficeSceneId } from '../config/officeScenes';
import styles from '../index.module.css';

const ICON_SIZE = 20;

const OFFICE_SCENE_ICONS: Record<OfficeSceneId, typeof Form> = {
  spreadsheet: Form,
  document: FileText,
  presentation: Ppt,
  organize: FolderOpen,
  scheduled: AlarmClock,
  general: MessageOne,
} satisfies Record<OfficeSceneId, typeof Form>;

type OfficeSceneIconProps = {
  sceneId: OfficeSceneId;
};

const OfficeSceneIcon: React.FC<OfficeSceneIconProps> = ({ sceneId }) => {
  const Icon = OFFICE_SCENE_ICONS[sceneId];

  return (
    <Icon
      theme='outline'
      size={ICON_SIZE}
      fill={iconColors.secondary}
      className={styles.officeSceneIcon}
      aria-hidden='true'
      style={{ lineHeight: 0 }}
    />
  );
};

export default OfficeSceneIcon;
