/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { Button } from '@arco-design/web-react';
import { ArrowLeft } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styles from './KbChatHeader.module.css';

type KbChatHeaderProps = {
  kbName: string;
};

export const KbChatHeader = ({ kbName }: KbChatHeaderProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className={styles.root}>
      <Button
        type='text'
        size='small'
        icon={<ArrowLeft />}
        onClick={() => navigate('/knowledge-base')}
      >
        {t('kb-chat.header.back')}
      </Button>
      <div className={styles.text}>
        <div className={styles.title}>{t('kb-chat.header.title')}</div>
        <div className={styles.subtitle}>{t('kb-chat.header.subtitle', { name: kbName })}</div>
      </div>
    </div>
  );
};