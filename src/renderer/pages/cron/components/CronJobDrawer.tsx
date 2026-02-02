/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronJob } from '@/common/ipcBridge';
import { Drawer, Form, Input, Switch, Message, Button, Popconfirm } from '@arco-design/web-react';
import { AlarmClock, DeleteOne } from '@icon-park/react';
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

const FormItem = Form.Item;
const TextArea = Input.TextArea;

interface CronJobDrawerProps {
  visible: boolean;
  job: ICronJob;
  onClose: () => void;
  onSave: (updates: { message: string; enabled: boolean }) => Promise<void>;
  onDelete: () => Promise<void>;
}

const CronJobDrawer: React.FC<CronJobDrawerProps> = ({ visible, job, onClose, onSave, onDelete }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Parse initial values from job
  const initialValues = useMemo(() => {
    return {
      enabled: job.enabled,
      command: job.target.payload.text,
    };
  }, [job]);

  // Format next run time
  const nextRunTime = useMemo(() => {
    if (!job.state.nextRunAtMs) return null;
    return dayjs(job.state.nextRunAtMs).format('YYYY-MM-DD HH:mm');
  }, [job.state.nextRunAtMs]);

  // Reset form when job changes
  useEffect(() => {
    if (visible) {
      form.setFieldsValue(initialValues);
    }
  }, [visible, initialValues, form]);

  const handleSave = async () => {
    try {
      const values = await form.validate();
      setSaving(true);

      await onSave({
        message: values.command,
        enabled: values.enabled,
      });

      Message.success(t('cron.drawer.saveSuccess'));
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        Message.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
      Message.success(t('cron.deleteSuccess'));
      onClose();
    } catch (err) {
      Message.error(String(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Drawer
      width={400}
      title={
        <div className='inline-flex items-center gap-8px'>
          <AlarmClock theme='outline' size={18} strokeWidth={4} fill='currentColor' className='flex items-center' />
          <span className='leading-none'>{t('cron.drawer.title')}</span>
        </div>
      }
      visible={visible}
      onCancel={onClose}
      footer={
        <div className='flex justify-between'>
          <Button type='primary' shape='round' loading={saving} onClick={handleSave}>
            {t('cron.drawer.save')}
          </Button>
          <Popconfirm title={t('cron.confirmDelete')} onOk={handleDelete}>
            <Button status='danger' shape='round' loading={deleting} icon={<DeleteOne theme='outline' size={14} />}>
              {t('cron.actions.delete')}
            </Button>
          </Popconfirm>
        </div>
      }
    >
      <Form form={form} layout='vertical' initialValues={initialValues} className='space-y-12px'>
        {/* Name Section */}
        <div className='bg-2 rd-16px px-16px py-16px'>
          <div className='flex items-center justify-between'>
            <span className='text-14px'>{t('cron.drawer.name')}</span>
            <span className='text-14px font-medium'>{job.name}</span>
          </div>
        </div>

        {/* Task Status Section */}
        <div className='bg-2 rd-16px px-16px py-16px'>
          <div className='flex items-center justify-between'>
            <span className='text-14px'>{t('cron.drawer.taskStatus')}</span>
            <div className='flex items-center gap-8px'>
              <Form.Item shouldUpdate noStyle>
                {(values) => <span className='text-14px text-text-3'>{values.enabled ? t('cron.drawer.enabled') : t('cron.drawer.disabled')}</span>}
              </Form.Item>
              <FormItem field='enabled' triggerPropName='checked' noStyle>
                <Switch />
              </FormItem>
            </div>
          </div>
        </div>

        {/* Command Section */}
        <div className='bg-2 rd-16px px-16px py-16px'>
          <FormItem label={t('cron.drawer.command')} field='command' rules={[{ required: true }]} className='!mb-0'>
            <TextArea placeholder={t('cron.drawer.commandPlaceholder')} autoSize={{ minRows: 2, maxRows: 10 }} className='!bg-bg-1' />
          </FormItem>
        </div>

        {/* Schedule Info Section */}
        <div className='bg-2 rd-16px px-16px py-16px space-y-12px'>
          <div className='flex items-center justify-between'>
            <span className='text-14px'>{t('cron.drawer.schedule')}</span>
            <span className='text-14px font-medium'>{job.schedule.description}</span>
          </div>
          {nextRunTime && (
            <div className='flex items-center justify-between'>
              <span className='text-14px'>{t('cron.drawer.nextRun')}</span>
              <span className='text-14px font-medium'>{nextRunTime}</span>
            </div>
          )}
        </div>
      </Form>
    </Drawer>
  );
};

export default CronJobDrawer;
