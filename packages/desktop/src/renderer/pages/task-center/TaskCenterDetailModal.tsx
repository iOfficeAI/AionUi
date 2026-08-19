/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { Descriptions, Modal } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ITaskCenterRow } from '@/common/adapter/ipcBridge';

export interface TaskCenterDetailModalProps {
  visible: boolean;
  item: ITaskCenterRow | null;
  onClose: () => void;
}

const TaskCenterDetailModal: React.FC<TaskCenterDetailModalProps> = ({ visible, item, onClose }) => {
  const { t } = useTranslation();
  const [showRaw, setShowRaw] = useState(false);

  if (!item) return null;

  const basicData = [
    { key: 'name', label: String(t('taskCenter.detail.fields.name')), value: item.name || '-' },
    { key: 'mark', label: String(t('taskCenter.detail.fields.mark')), value: item.mark || '-' },
    { key: 'projectName', label: String(t('taskCenter.detail.fields.projectName')), value: item.projectName || '-' },
    { key: 'partName', label: String(t('taskCenter.detail.fields.partName')), value: item.partName || '-' },
    { key: 'milestoneName', label: String(t('taskCenter.detail.fields.milestoneName')), value: item.milestoneName || '-' },
    { key: 'typeDesc', label: String(t('taskCenter.detail.fields.typeDesc')), value: item.typeDesc || '-' },
  ];

  const progressData = [
    { key: 'urgencyDesc', label: String(t('taskCenter.detail.fields.urgencyDesc')), value: item.urgencyDesc || '-' },
    { key: 'statusDesc', label: String(t('taskCenter.detail.fields.statusDesc')), value: item.statusDesc || '-' },
    { key: 'deadlineTime', label: String(t('taskCenter.detail.fields.deadlineTime')), value: item.deadlineTime || '-' },
    { key: 'startTime', label: String(t('taskCenter.detail.fields.startTime')), value: item.startTime || '-' },
    { key: 'endTime', label: String(t('taskCenter.detail.fields.endTime')), value: item.endTime || '-' },
    { key: 'closeTime', label: String(t('taskCenter.detail.fields.closeTime')), value: item.closeTime || '-' },
    { key: 'creatorName', label: String(t('taskCenter.detail.fields.creatorName')), value: item.creatorName || '-' },
    { key: 'createTime', label: String(t('taskCenter.detail.fields.createTime')), value: item.createTime || '-' },
    { key: 'updatorName', label: String(t('taskCenter.detail.fields.updatorName')), value: item.updatorName || '-' },
    { key: 'updateTime', label: String(t('taskCenter.detail.fields.updateTime')), value: item.updateTime || '-' },
  ];

  return (
    <Modal
      title={String(t('taskCenter.detail.title'))}
      visible={visible}
      onCancel={onClose}
      onOk={onClose}
      okText={String(t('common.close'))}
      cancelText={null}
      width={720}
      style={{ maxHeight: '80vh' }}
    >
      <div className='flex flex-col gap-16px'>
        <section>
          <h3 className='m-0 mb-8px text-14px font-600 text-t-primary'>
            {String(t('taskCenter.detail.basicInfo'))}
          </h3>
          <Descriptions
            column={2}
            border
            size='small'
            data={basicData.map((d) => ({ key: d.key, label: d.label, value: d.value }))}
          />
        </section>

        <section>
          <h3 className='m-0 mb-8px text-14px font-600 text-t-primary'>
            {String(t('taskCenter.detail.progressInfo'))}
          </h3>
          <Descriptions
            column={2}
            border
            size='small'
            data={progressData.map((d) => ({ key: d.key, label: d.label, value: d.value }))}
          />
        </section>

        {(item.content || item.remark) && (
          <section>
            <h3 className='m-0 mb-8px text-14px font-600 text-t-primary'>
              {String(t('taskCenter.detail.content'))}
            </h3>
            {item.content && (
              <div className='mb-8px max-h-200px overflow-auto whitespace-pre-wrap rounded-6px bg-fill-2 p-10px text-13px text-t-primary'>
                {item.content}
              </div>
            )}
            {item.remark && (
              <div>
                <strong className='text-t-secondary'>{String(t('taskCenter.detail.remark'))}: </strong>
                <span className='text-t-primary'>{item.remark}</span>
              </div>
            )}
          </section>
        )}

        <section>
          <button
            type='button'
            className='cursor-pointer text-12px text-primary-6 hover:underline'
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? String(t('taskCenter.detail.hideRawFields')) : String(t('taskCenter.detail.showRawFields'))}
          </button>
          {showRaw && (
            <pre className='mt-8px max-h-200px overflow-auto rounded-6px bg-fill-2 p-10px text-11px text-t-secondary'>
              {JSON.stringify(item.raw, null, 2)}
            </pre>
          )}
        </section>
      </div>
    </Modal>
  );
};

export default TaskCenterDetailModal;