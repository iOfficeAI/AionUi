/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tooltip } from '@arco-design/web-react';
import React from 'react';
import styles from './SiderWorkspacePanel.module.css';

type SiderWorkspaceActionBtnProps = {
  tooltip: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

/** Icon control — matches ConversationPane `.actionBtn` (28×28). */
export const SiderWorkspaceActionBtn: React.FC<SiderWorkspaceActionBtnProps> = ({
  tooltip,
  icon,
  onClick,
  disabled,
}) => (
  <Tooltip content={tooltip} position='bottom'>
    <button type='button' className={styles.actionBtn} onClick={onClick} disabled={disabled} aria-label={tooltip}>
      {icon}
    </button>
  </Tooltip>
);
