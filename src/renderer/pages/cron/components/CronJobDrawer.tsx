/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronJob, ICronSchedule } from '@/common/ipcBridge';
import { Drawer, Form, Input, Switch, Select, TimePicker, InputNumber, Message, Button, Popconfirm, Checkbox } from '@arco-design/web-react';
import { AlarmClock, DeleteOne } from '@icon-park/react';
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

const FormItem = Form.Item;
const TextArea = Input.TextArea;
const CheckboxGroup = Checkbox.Group;

type ScheduleType = 'daily' | 'weekly' | 'interval';

interface CronJobDrawerProps {
  visible: boolean;
  job: ICronJob;
  onClose: () => void;
  onSave: (updates: { name: string; message: string; schedule: ICronSchedule; enabled: boolean }) => Promise<void>;
  onDelete: () => Promise<void>;
}

/**
 * Parse existing schedule to get type and values
 */
const parseSchedule = (schedule: ICronSchedule): { type: ScheduleType; time: string; weekdays: string[]; intervalValue: number; intervalUnit: 'minutes' | 'hours' } => {
  const defaults = {
    time: '09:00',
    weekdays: ['1'], // Monday
    intervalValue: 30,
    intervalUnit: 'minutes' as const,
  };

  if (schedule.kind === 'every') {
    const minutes = Math.floor(schedule.everyMs / 60000);
    if (minutes >= 60) {
      return { type: 'interval', ...defaults, intervalValue: Math.floor(minutes / 60), intervalUnit: 'hours' };
    }
    return { type: 'interval', ...defaults, intervalValue: minutes, intervalUnit: 'minutes' };
  }

  if (schedule.kind === 'cron') {
    const expr = schedule.expr;
    // Try to parse simple daily pattern: "0 9 * * *" or "0 9 * * 1,2,3"
    const match = expr.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+(.+)$/);
    if (match) {
      const [, minute, hour, weekdayPart] = match;
      const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      if (weekdayPart === '*') {
        return { type: 'daily', ...defaults, time };
      }
      const weekdays = weekdayPart.split(',').map((d) => d.trim());
      return { type: 'weekly', ...defaults, time, weekdays };
    }
  }

  // Default to daily
  return { type: 'daily', ...defaults };
};

/**
 * Build schedule from form values
 */
const buildSchedule = (type: ScheduleType, time: string, weekdays: string[], intervalValue: number, intervalUnit: 'minutes' | 'hours'): ICronSchedule => {
  if (type === 'interval') {
    const ms = intervalUnit === 'hours' ? intervalValue * 3600000 : intervalValue * 60000;
    return { kind: 'every', everyMs: ms, description: `Every ${intervalValue} ${intervalUnit}` };
  }

  // Daily or Weekly - build cron expression
  const [hour, minute] = time.split(':').map(Number);
  if (type === 'daily') {
    const expr = `${minute} ${hour} * * *`;
    return { kind: 'cron', expr, description: `Daily at ${time}` };
  }

  // Weekly
  const weekdayStr = weekdays.join(',');
  const expr = `${minute} ${hour} * * ${weekdayStr}`;
  return { kind: 'cron', expr, description: `Weekly at ${time}` };
};

const CronJobDrawer: React.FC<CronJobDrawerProps> = ({ visible, job, onClose, onSave, onDelete }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Parse initial values from job
  const initialValues = useMemo(() => {
    const parsed = parseSchedule(job.schedule);
    return {
      name: job.name,
      enabled: job.enabled,
      command: job.target.payload.text,
      scheduleType: parsed.type,
      time: parsed.time,
      weekdays: parsed.weekdays,
      intervalValue: parsed.intervalValue,
      intervalUnit: parsed.intervalUnit,
    };
  }, [job]);

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

      const schedule = buildSchedule(values.scheduleType, values.time, values.weekdays || [], values.intervalValue || 30, values.intervalUnit || 'minutes');

      await onSave({
        name: values.name,
        message: values.command,
        schedule,
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

  const weekdayOptions = [
    { label: t('cron.drawer.weekdayMon'), value: '1' },
    { label: t('cron.drawer.weekdayTue'), value: '2' },
    { label: t('cron.drawer.weekdayWed'), value: '3' },
    { label: t('cron.drawer.weekdayThu'), value: '4' },
    { label: t('cron.drawer.weekdayFri'), value: '5' },
    { label: t('cron.drawer.weekdaySat'), value: '6' },
    { label: t('cron.drawer.weekdaySun'), value: '0' },
  ];

  const scheduleTypeOptions = [
    { label: t('cron.drawer.scheduleTypeDaily'), value: 'daily' },
    { label: t('cron.drawer.scheduleTypeWeekly'), value: 'weekly' },
    { label: t('cron.drawer.scheduleTypeInterval'), value: 'interval' },
  ];

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
          <FormItem label={t('cron.drawer.name')} field='name' rules={[{ required: true }]} className='!mb-0'>
            <Input placeholder={t('cron.drawer.namePlaceholder')} />
          </FormItem>
        </div>

        {/* Task Status Section */}
        <div className='bg-2 rd-16px px-16px py-16px'>
          <div className='flex items-center justify-between'>
            <span className='text-14px'>{t('cron.drawer.taskStatus')}</span>
            <FormItem field='enabled' triggerPropName='checked' noStyle>
              <Switch checkedText={t('cron.drawer.enabled')} uncheckedText={t('cron.drawer.disabled')} />
            </FormItem>
          </div>
        </div>

        {/* Schedule Section */}
        <div className='bg-2 rd-16px px-16px py-16px'>
          {/* Command */}
          <FormItem label={t('cron.drawer.command')} field='command' rules={[{ required: true }]}>
            <TextArea placeholder={t('cron.drawer.commandPlaceholder')} autoSize={{ minRows: 2, maxRows: 6 }} />
          </FormItem>

          {/* Schedule Type */}
          <FormItem label={t('cron.drawer.scheduleType')} field='scheduleType'>
            <Select options={scheduleTypeOptions} />
          </FormItem>

          {/* Conditional fields based on schedule type */}
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.scheduleType !== cur.scheduleType}>
            {(values) => {
              const scheduleType = values.scheduleType as ScheduleType;

              if (scheduleType === 'daily' || scheduleType === 'weekly') {
                return (
                  <>
                    <FormItem label={t('cron.drawer.time')} field='time' className={scheduleType === 'daily' ? '!mb-0' : ''}>
                      <TimePicker format='HH:mm' value={dayjs(values.time, 'HH:mm')} onChange={(_, timeStr) => form.setFieldValue('time', timeStr)} style={{ width: '100%' }} />
                    </FormItem>
                    {scheduleType === 'weekly' && (
                      <FormItem label={t('cron.drawer.weekday')} field='weekdays' className='!mb-0'>
                        <CheckboxGroup options={weekdayOptions} />
                      </FormItem>
                    )}
                  </>
                );
              }

              if (scheduleType === 'interval') {
                return (
                  <div className='flex gap-8px'>
                    <FormItem label={t('cron.drawer.interval')} field='intervalValue' className='flex-1 !mb-0'>
                      <InputNumber min={1} max={1440} />
                    </FormItem>
                    <FormItem label='&nbsp;' field='intervalUnit' className='w-100px !mb-0'>
                      <Select
                        options={[
                          { label: t('cron.drawer.intervalMinutes'), value: 'minutes' },
                          { label: t('cron.drawer.intervalHours'), value: 'hours' },
                        ]}
                      />
                    </FormItem>
                  </div>
                );
              }

              return null;
            }}
          </Form.Item>
        </div>
      </Form>
    </Drawer>
  );
};

export default CronJobDrawer;
