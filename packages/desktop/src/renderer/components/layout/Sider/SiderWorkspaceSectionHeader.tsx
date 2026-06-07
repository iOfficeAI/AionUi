/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import styles from './SiderWorkspacePanel.module.css';

type SiderWorkspaceSectionHeaderProps = {
  title: React.ReactNode;
  actions?: React.ReactNode;
};

/** Section chrome — aligned with ConversationPane `.header` / `.title`. */
const SiderWorkspaceSectionHeader: React.FC<SiderWorkspaceSectionHeaderProps> = ({ title, actions }) => (
  <div className={styles.header}>
    <h3 className={styles.title}>{title}</h3>
    {actions ? <div className={styles.actions}>{actions}</div> : null}
  </div>
);

export default SiderWorkspaceSectionHeader;