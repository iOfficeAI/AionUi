/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@/renderer/components/base/AionModal';
import { Button } from '@arco-design/web-react';
import { Attention } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type ConversationDeleteModalProps = {
  visible: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

const ConversationDeleteModal: React.FC<ConversationDeleteModalProps> = ({ visible, loading, onCancel, onConfirm }) => {
  const { t } = useTranslation();

  return (
    <AionModal
      visible={visible}
      variant='standard'
      className='!w-440px'
      alignCenter
      maskClosable={!loading}
      escToExit={!loading}
      header={{
        className: 'px-24px pt-24px pb-8px',
        render: () => (
          <div className='flex items-center gap-12px'>
            <span
              aria-hidden='true'
              className='flex h-40px w-40px shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning'
            >
              <Attention theme='filled' size={20} fill='currentColor' />
            </span>
            <h3 className='m-0 text-18px font-600 leading-26px text-t-primary'>
              {t('conversation.history.deleteDialogTitle')}
            </h3>
          </div>
        ),
      }}
      footer={{
        divider: true,
        render: () => (
          <div className='flex justify-end gap-10px'>
            <Button className='!h-36px !min-w-88px !rd-8px' disabled={loading} onClick={onCancel}>
              {t('conversation.history.cancelDelete')}
            </Button>
            <Button
              type='primary'
              status='danger'
              className='!h-36px !min-w-88px !rd-8px'
              loading={loading}
              onClick={() => void onConfirm()}
            >
              {t('conversation.history.confirmDelete')}
            </Button>
          </div>
        ),
      }}
      onCancel={onCancel}
    >
      <div className='flex flex-col gap-6px'>
        <p className='m-0 text-15px font-500 leading-22px text-t-primary'>{t('conversation.history.deleteConfirm')}</p>
        <p className='m-0 text-14px leading-22px text-t-secondary'>{t('conversation.history.deleteWarning')}</p>
      </div>
    </AionModal>
  );
};

export default ConversationDeleteModal;
