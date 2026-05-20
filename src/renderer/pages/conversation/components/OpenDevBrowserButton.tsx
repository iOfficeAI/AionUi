/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Browser } from '@icon-park/react';

interface OpenDevBrowserButtonProps {
  conversationId: string;
}

const OpenDevBrowserButton: React.FC<OpenDevBrowserButtonProps> = ({ conversationId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    void navigate(`/devbrowser?from=${encodeURIComponent(conversationId)}`);
  }, [navigate, conversationId]);

  return (
    <button
      type='button'
      onClick={handleClick}
      aria-label='open-dev-browser'
      className='h-28px px-10px rounded-6px border border-[rgba(var(--primary-6),0.3)] bg-[rgba(var(--primary-6),0.08)] text-primary-6 hover:bg-[rgba(var(--primary-6),0.16)] cursor-pointer flex items-center gap-6px shrink-0 text-12px font-medium transition-colors'
    >
      <Browser theme='outline' size={14} />
      {t('conversation.devBrowser.openWebPage')}
    </button>
  );
};

export default OpenDevBrowserButton;
