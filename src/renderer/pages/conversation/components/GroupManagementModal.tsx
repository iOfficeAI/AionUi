/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Modal, Popconfirm } from '@arco-design/web-react';
import { Delete, Edit } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface GroupManagementModalProps {
  visible: boolean;
  groups: Array<{ id: string; name: string }>;
  onCreateGroup: (name: string) => { id: string; name: string } | null;
  onRenameGroup: (groupId: string, newName: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onClose: () => void;
}

const GroupManagementModal: React.FC<GroupManagementModalProps> = ({
  visible,
  groups,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onClose,
}) => {
  const { t } = useTranslation();
  const [newGroupName, setNewGroupName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = () => {
    const result = onCreateGroup(newGroupName);
    if (result) {
      setNewGroupName('');
    }
  };

  const handleStartEdit = (groupId: string, currentName: string) => {
    setEditingId(groupId);
    setEditName(currentName);
  };

  const handleConfirmEdit = () => {
    if (editingId && editName.trim()) {
      onRenameGroup(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName('');
  };

  return (
    <Modal
      title={t('conversation.history.manageGroups', 'Manage groups')}
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{ borderRadius: '12px' }}
      alignCenter
      getPopupContainer={() => document.body}
    >
      <div className='flex flex-col gap-12px py-8px'>
        {/* Create new group */}
        <div className='flex gap-8px'>
          <Input
            value={newGroupName}
            onChange={setNewGroupName}
            onPressEnter={handleCreate}
            placeholder={t('conversation.history.groupNamePlaceholder', 'Group name')}
            allowClear
            className='flex-1'
          />
          <Button type='primary' onClick={handleCreate} disabled={!newGroupName.trim()}>
            {t('common.create', 'Create')}
          </Button>
        </div>

        {/* Group list */}
        {groups.length === 0 ? (
          <div className='text-13px text-t-secondary py-16px text-center'>
            {t('conversation.history.noGroup', 'No groups')}
          </div>
        ) : (
          <div className='flex flex-col gap-4px'>
            {groups.map((group) => (
              <div key={group.id} className='flex items-center gap-8px px-8px py-6px rounded-8px bg-fill-1'>
                {editingId === group.id ? (
                  <Input
                    autoFocus
                    size='small'
                    value={editName}
                    onChange={setEditName}
                    onPressEnter={handleConfirmEdit}
                    onBlur={handleConfirmEdit}
                    className='flex-1'
                  />
                ) : (
                  <span className='flex-1 text-14px text-t-primary truncate'>{group.name}</span>
                )}
                <Button
                  type='text'
                  size='mini'
                  icon={<Edit theme='outline' size='14' />}
                  onClick={() => handleStartEdit(group.id, group.name)}
                />
                <Popconfirm
                  title={t('conversation.history.groupDeleteConfirm', 'Delete group?')}
                  onOk={() => onDeleteGroup(group.id)}
                  getPopupContainer={() => document.body}
                >
                  <Button type='text' size='mini' status='warning' icon={<Delete theme='outline' size='14' />} />
                </Popconfirm>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default GroupManagementModal;
