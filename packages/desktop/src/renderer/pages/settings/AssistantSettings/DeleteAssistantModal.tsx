/**
 * DeleteAssistantModal — Confirmation modal for deleting an assistant.
 */
import type { AssistantListItem } from './types';
import AssistantAvatar from './AssistantAvatar';
import { Modal } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type DeleteAssistantModalProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  activeAssistant: AssistantListItem | null;
  avatarImageMap: Record<string, string>;
};

const DeleteAssistantModal: React.FC<DeleteAssistantModalProps> = ({
  visible,
  onCancel,
  onConfirm,
  activeAssistant,
  avatarImageMap,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      title={t('settings.deleteAssistantTitle', { defaultValue: 'Delete Assistant' })}
      visible={visible}
      onCancel={onCancel}
      onOk={onConfirm}
      okButtonProps={{ status: 'danger' }}
      wrapClassName='delete-assistant-modal'
      data-testid='modal-delete-assistant'
      okText={t('common.delete', { defaultValue: 'Delete' })}
      cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
      className='w-[90vw] md:w-[400px]'
      wrapStyle={{ zIndex: 10000 }}
      maskStyle={{ zIndex: 9999 }}
    >
      <p>
        {t('settings.deleteAssistantConfirm', {
          defaultValue: 'Are you sure you want to delete this assistant? This action cannot be undone.',
        })}
      </p>
      {activeAssistant && (
        <div className='mt-12px p-12px bg-fill-2 rounded-lg flex items-center gap-12px'>
          <AssistantAvatar assistant={activeAssistant} size={32} avatarImageMap={avatarImageMap} />
          <div>
            <div className='font-medium'>{activeAssistant.name}</div>
            <div className='text-12px text-t-secondary'>{activeAssistant.description}</div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default DeleteAssistantModal;
