/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Tooltip } from '@arco-design/web-react';
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
    <Tooltip content={t('conversation.devBrowser.openWebPage')}>
      <button
        type='button'
        onClick={handleClick}
        aria-label='open-dev-browser'
        className='w-28px h-28px rounded-6px border border-border-2 bg-bg-3 text-t-secondary cursor-pointer hover:bg-fill-2 flex items-center justify-center shrink-0'
      >
        <Browser theme='outline' size={16} />
      </button>
    </Tooltip>
  );
};

export default OpenDevBrowserButton;
