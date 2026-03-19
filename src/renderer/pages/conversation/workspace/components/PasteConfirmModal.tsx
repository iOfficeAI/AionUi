/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Checkbox, Modal } from '@arco-design/web-react';
import { FileText, FolderOpen } from '@icon-park/react';
import React from 'react';
import type { TFunction } from 'i18next';
import type { PasteConfirmState, TargetFolderPath } from '../types';

type PasteConfirmModalProps = {
  pasteConfirm: PasteConfirmState;
  setPasteConfirm: React.Dispatch<React.SetStateAction<PasteConfirmState>>;
  closePasteConfirm: () => void;
  handlePasteConfirm: () => Promise<void>;
  targetFolderPath: TargetFolderPath;
  t: TFunction;
};

/** Modal for confirming file paste operations with file list and target folder display. */
const PasteConfirmModal: React.FC<PasteConfirmModalProps> = ({
  pasteConfirm,
  setPasteConfirm,
  closePasteConfirm,
  handlePasteConfirm,
  targetFolderPath,
  t,
}) => {
  return (
    <Modal
      visible={pasteConfirm.visible}
      title={null}
      onCancel={() => {
        closePasteConfirm();
      }}
      footer={null}
      style={{ borderRadius: '12px' }}
      className='paste-confirm-modal'
      alignCenter
      getPopupContainer={() => document.body}
    >
      <div className='px-24px py-20px'>
        {/* Title area */}
        <div className='flex items-center gap-12px mb-20px'>
          <div
            className='flex items-center justify-center w-48px h-48px rounded-full'
            style={{ backgroundColor: 'rgb(var(--primary-1))' }}
          >
            <FileText theme='outline' size='24' fill='rgb(var(--primary-6))' />
          </div>
          <div>
            <div className='text-16px font-semibold mb-4px'>{t('conversation.workspace.pasteConfirm_title')}</div>
            <div className='text-13px' style={{ color: 'var(--color-text-3)' }}>
              {pasteConfirm.filesToPaste.length > 1
                ? t('conversation.workspace.pasteConfirm_multipleFiles', {
                    count: pasteConfirm.filesToPaste.length,
                  })
                : t('conversation.workspace.pasteConfirm_title')}
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className='mb-20px px-12px py-16px rounded-8px' style={{ backgroundColor: 'var(--color-fill-2)' }}>
          <div className='flex items-start gap-12px mb-12px'>
            <FileText theme='outline' size='18' fill='var(--color-text-2)' style={{ marginTop: '2px' }} />
            <div className='flex-1'>
              <div className='text-13px mb-4px' style={{ color: 'var(--color-text-3)' }}>
                {t('conversation.workspace.pasteConfirm_fileName')}
              </div>
              <div className='text-14px font-medium break-all' style={{ color: 'var(--color-text-1)' }}>
                {pasteConfirm.fileName}
              </div>
            </div>
          </div>
          <div className='flex items-start gap-12px'>
            <FolderOpen theme='outline' size='18' fill='var(--color-text-2)' style={{ marginTop: '2px' }} />
            <div className='flex-1'>
              <div className='text-13px mb-4px' style={{ color: 'var(--color-text-3)' }}>
                {t('conversation.workspace.pasteConfirm_targetFolder')}
              </div>
              <div className='text-14px font-medium font-mono break-all' style={{ color: 'rgb(var(--primary-6))' }}>
                {targetFolderPath.fullPath}
              </div>
            </div>
          </div>
        </div>

        {/* Checkbox area */}
        <div className='mb-20px'>
          <Checkbox
            checked={pasteConfirm.doNotAsk}
            onChange={(v) => setPasteConfirm((prev) => ({ ...prev, doNotAsk: v }))}
          >
            <span className='text-13px' style={{ color: 'var(--color-text-2)' }}>
              {t('conversation.workspace.pasteConfirm_noAsk')}
            </span>
          </Checkbox>
        </div>

        {/* Button area */}
        <div className='flex gap-12px justify-end'>
          <button
            className='px-16px py-8px rounded-6px text-14px font-medium transition-all'
            style={{
              border: '1px solid var(--color-border-2)',
              backgroundColor: 'transparent',
              color: 'var(--color-text-1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              closePasteConfirm();
            }}
          >
            {t('conversation.workspace.pasteConfirm_cancel')}
          </button>
          <button
            className='px-16px py-8px rounded-6px text-14px font-medium transition-all'
            style={{
              border: 'none',
              backgroundColor: 'rgb(var(--primary-6))',
              color: 'white',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgb(var(--primary-5))';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgb(var(--primary-6))';
            }}
            onClick={async () => {
              await handlePasteConfirm();
            }}
          >
            {t('conversation.workspace.pasteConfirm_paste')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default PasteConfirmModal;
