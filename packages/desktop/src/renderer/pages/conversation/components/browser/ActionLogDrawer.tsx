/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Drawer, Button, Tag, Typography, Space, Empty, Modal, Image } from '@arco-design/web-react';
import { CheckOne, CloseOne, Loading, Delete, PreviewOpen, Pause } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { BrowserToolProgressEvent } from '@/process/services/browser/BrowserToolService';

const { Text, Paragraph } = Typography;

export type ActionLogItem = BrowserToolProgressEvent & {
  id: string;
  timestamp: number;
  failureScreenshot?: string;
};

export type ActionLogDrawerProps = {
  visible: boolean;
  onClose: () => void;
  onCancelActiveTask?: (taskId: string) => void;
};

export const ActionLogDrawer: React.FC<ActionLogDrawerProps> = ({ visible, onClose, onCancelActiveTask }) => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<ActionLogItem[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    if (!window.electronAPI?.onBrowserToolProgress) return;

    const unsubscribe = window.electronAPI.onBrowserToolProgress((event: unknown) => {
      const progress = event as BrowserToolProgressEvent;
      setLogs((prev) => {
        const item: ActionLogItem = {
          ...progress,
          id: `${progress.taskId}_${progress.phase}_${Date.now()}`,
          timestamp: Date.now(),
        };
        return [item, ...prev].slice(0, 50); // Keep last 50 logs
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const clearLogs = () => {
    setLogs([]);
  };

  const getPhaseTag = (phase: string) => {
    switch (phase) {
      case 'completed':
        return (
          <Tag color='green' size='small' icon={<CheckOne />}>
            Completed
          </Tag>
        );
      case 'failed':
        return (
          <Tag color='red' size='small' icon={<CloseOne />}>
            Failed
          </Tag>
        );
      case 'cancelled':
        return (
          <Tag color='gray' size='small'>
            Cancelled
          </Tag>
        );
      case 'started':
      case 'progress':
      default:
        return (
          <Tag color='arcoblue' size='small' icon={<Loading />}>
            Running
          </Tag>
        );
    }
  };

  return (
    <>
      <Drawer
        width={420}
        title={
          <div className='flex items-center justify-between w-full pr-4'>
            <Space>
              <Text bold>Action Log</Text>
              <Tag size='small' color='arcoblue'>
                {logs.length}
              </Tag>
            </Space>
            <Button size='mini' type='text' icon={<Delete />} onClick={clearLogs}>
              Clear
            </Button>
          </div>
        }
        visible={visible}
        onOk={onClose}
        onCancel={onClose}
        footer={null}
      >
        {logs.length === 0 ? (
          <Empty description='No automated actions recorded yet' className='mt-16' />
        ) : (
          <div className='flex flex-col gap-3'>
            {logs.map((log) => (
              <div
                key={log.id}
                className='p-3 bg-[var(--color-fill-2)] rounded border border-[var(--color-border-2)] flex flex-col gap-2'
              >
                <div className='flex items-center justify-between'>
                  <Space size={6}>
                    <Text bold className='text-xs'>
                      {log.tool}
                    </Text>
                    {getPhaseTag(log.phase)}
                  </Space>
                  <Text type='secondary' className='text-[10px]'>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </Text>
                </div>

                <Paragraph className='text-xs mb-0 text-[var(--color-text-2)]'>{log.message}</Paragraph>

                {log.phase === 'progress' || log.phase === 'started' ? (
                  <div className='flex justify-end mt-1'>
                    <Button
                      size='mini'
                      status='danger'
                      type='outline'
                      icon={<Pause />}
                      onClick={() => onCancelActiveTask?.(log.taskId)}
                    >
                      Halt Task
                    </Button>
                  </div>
                ) : null}

                {log.failureScreenshot && (
                  <div className='mt-2 flex items-center gap-2'>
                    <Button
                      size='mini'
                      type='secondary'
                      icon={<PreviewOpen />}
                      onClick={() => setPreviewImage(log.failureScreenshot || null)}
                    >
                      View Error Screenshot
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Drawer>

      <Modal
        visible={Boolean(previewImage)}
        title='Failure Screenshot Preview'
        footer={null}
        onCancel={() => setPreviewImage(null)}
        style={{ width: '80vw', maxWidth: '1000px' }}
      >
        {previewImage && (
          <div className='flex justify-center max-h-[70vh] overflow-auto'>
            <Image src={previewImage} alt='Failure screenshot' />
          </div>
        )}
      </Modal>
    </>
  );
};
