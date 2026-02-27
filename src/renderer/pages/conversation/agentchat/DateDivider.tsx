/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import styles from './agentchat.module.css';

type DateDividerProps = {
  date: string;
};

const DateDivider: React.FC<DateDividerProps> = ({ date }) => {
  return <div className={styles.dateDivider}>{date}</div>;
};

export default React.memo(DateDivider);
