/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { Button, Descriptions, Message, Modal as ArcoModal } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ITaskCenterRow } from '@/common/adapter/ipcBridge';

// Arco Modal's TS typings don't play well with React 19's stricter children
// inference (ModalProps extends PropsWithChildren but the runtime accepts the
// children we pass). Cast to any to keep strict-mode happy without disabling
// checks project-wide. Runtime behavior is unchanged.
const Modal = ArcoModal as unknown as React.FC<{
  title?: React.ReactNode;
  visible?: boolean;
  onCancel?: () => void;
  onOk?: () => void;
  okText?: React.ReactNode;
  cancelText?: React.ReactNode;
  hideCancel?: boolean;
  footer?: React.ReactNode;
  width?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}>;

export interface TaskCenterDetailModalProps {
  visible: boolean;
  item: ITaskCenterRow | null;
  onClose: () => void;
}

const TaskCenterDetailModal: React.FC<TaskCenterDetailModalProps> = ({ visible, item, onClose }) => {
  const { t } = useTranslation();
  const tZh = (key: string): string => String(t(key, { lng: 'zh-CN' }));
  const [showRaw, setShowRaw] = useState(false);

  if (!item) return null;

  const basicData = [
    { key: 'name', label: tZh('taskCenter.detail.fields.name'), value: item.name || '-' },
    { key: 'mark', label: tZh('taskCenter.detail.fields.mark'), value: item.mark || '-' },
    { key: 'projectName', label: tZh('taskCenter.detail.fields.projectName'), value: item.projectName || '-' },
    { key: 'partName', label: tZh('taskCenter.detail.fields.partName'), value: item.partName || '-' },
    {
      key: 'milestoneName',
      label: tZh('taskCenter.detail.fields.milestoneName'),
      value: item.milestoneName || '-',
    },
    { key: 'typeDesc', label: tZh('taskCenter.detail.fields.typeDesc'), value: item.typeDesc || '-' },
  ];

  const progressData = [
    { key: 'urgencyDesc', label: tZh('taskCenter.detail.fields.urgencyDesc'), value: item.urgencyDesc || '-' },
    { key: 'statusDesc', label: tZh('taskCenter.detail.fields.statusDesc'), value: item.statusDesc || '-' },
    { key: 'deadlineTime', label: tZh('taskCenter.detail.fields.deadlineTime'), value: item.deadlineTime || '-' },
    { key: 'startTime', label: tZh('taskCenter.detail.fields.startTime'), value: item.startTime || '-' },
    { key: 'endTime', label: tZh('taskCenter.detail.fields.endTime'), value: item.endTime || '-' },
    { key: 'closeTime', label: tZh('taskCenter.detail.fields.closeTime'), value: item.closeTime || '-' },
    { key: 'creatorName', label: tZh('taskCenter.detail.fields.creatorName'), value: item.creatorName || '-' },
    { key: 'createTime', label: tZh('taskCenter.detail.fields.createTime'), value: item.createTime || '-' },
    { key: 'updatorName', label: tZh('taskCenter.detail.fields.updatorName'), value: item.updatorName || '-' },
    { key: 'updateTime', label: tZh('taskCenter.detail.fields.updateTime'), value: item.updateTime || '-' },
  ];

  return (
    <Modal
      title={tZh('taskCenter.detail.title')}
      visible={visible}
      onCancel={onClose}
      onOk={onClose}
      okText={tZh('common.close')}
      hideCancel
      width={720}
      footer={
        <div className='flex items-center justify-end gap-8px'>
          <Button
            type='primary'
            data-testid='task-detail-start'
            onClick={() => Message.info(tZh('taskCenter.detail.startTaskTip'))}
          >
            {tZh('taskCenter.detail.startTask')}
          </Button>
          <Button type='secondary' onClick={onClose}>
            {tZh('common.close')}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-16px'>
        <section>
          <h3 className='m-0 mb-8px text-14px font-600 text-t-primary'>{tZh('taskCenter.detail.basicInfo')}</h3>
          <Descriptions
            column={2}
            border
            size='small'
            data={basicData.map((d) => ({ key: d.key, label: d.label, value: d.value }))}
          />
        </section>

        <section>
          <h3 className='m-0 mb-8px text-14px font-600 text-t-primary'>{tZh('taskCenter.detail.progressInfo')}</h3>
          <Descriptions
            column={2}
            border
            size='small'
            data={progressData.map((d) => ({ key: d.key, label: d.label, value: d.value }))}
          />
        </section>

        {(item.content || item.remark) && (
          <section>
            <h3 className='m-0 mb-8px text-14px font-600 text-t-primary'>{tZh('taskCenter.detail.content')}</h3>
            {item.content && (
              <div className='mb-8px max-h-200px overflow-auto whitespace-pre-wrap rounded-6px bg-fill-2 p-10px text-13px text-t-primary'>
                {item.content}
              </div>
            )}
            {item.remark && (
              <div>
                <strong className='text-t-secondary'>{tZh('taskCenter.detail.remark')}: </strong>
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
            {showRaw ? tZh('taskCenter.detail.hideRawFields') : tZh('taskCenter.detail.showRawFields')}
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
