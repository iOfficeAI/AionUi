/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Radio, Select } from '@arco-design/web-react';
import { Delete, Down, Up } from '@icon-park/react';
import type { GatewayAccount, GatewayCombo, GatewayComboTarget } from './types';

type ComboModalProps = {
  visible: boolean;
  combo?: GatewayCombo | null;
  accounts: GatewayAccount[];
  onClose: () => void;
  onSave: (combo: GatewayCombo) => void;
};

export const ComboModal: React.FC<ComboModalProps> = ({ visible, combo, accounts, onClose, onSave }) => {
  const [form] = Form.useForm();
  const [targets, setTargets] = useState<GatewayComboTarget[]>([]);

  useEffect(() => {
    if (visible) {
      if (combo) {
        form.setFieldsValue({
          name: combo.name,
          description: combo.description,
          strategy: combo.strategy,
        });
        setTargets(combo.targets || []);
      } else {
        form.setFieldsValue({
          name: '',
          description: '',
          strategy: 'priority',
        });
        setTargets([]);
      }
    }
  }, [visible, combo, form]);

  const addTarget = () => {
    const firstAcc = accounts[0];
    if (!firstAcc) return;
    setTargets((prev) => [
      ...prev,
      {
        accountId: firstAcc.id,
        model: firstAcc.models[0] || 'default',
      },
    ]);
  };

  const updateTarget = (index: number, patch: Partial<GatewayComboTarget>) => {
    setTargets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const removeTarget = (index: number) => {
    setTargets((prev) => prev.filter((_, i) => i !== index));
  };

  const moveTarget = (index: number, direction: 'up' | 'down') => {
    setTargets((prev) => {
      const next = [...prev];
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  const handleOk = async () => {
    try {
      const values = await form.validate();
      if (targets.length === 0) {
        Modal.error({
          title: 'Missing Targets',
          content: 'Please add at least one model target to this combo chain.',
        });
        return;
      }

      const updated: GatewayCombo = {
        id: combo ? combo.id : `combo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: values.name.trim(),
        description: values.description?.trim(),
        strategy: values.strategy,
        targets,
        enabled: combo ? combo.enabled : true,
      };

      onSave(updated);
      onClose();
    } catch (err) {
      console.warn('[ComboModal] Validation failed:', err);
    }
  };

  return (
    <Modal
      title={combo ? 'Edit Model Combo' : 'Create Model Combo'}
      visible={visible}
      onOk={handleOk}
      onCancel={onClose}
      okText='Save Combo'
      cancelText='Cancel'
      autoFocus={false}
      focusLock={true}
      style={{ width: '640px' }}
    >
      <Form form={form} layout='vertical'>
        <Form.Item
          label='Combo Name'
          field='name'
          rules={[{ required: true, message: 'Please enter a name for this combo' }]}
        >
          <Input placeholder='e.g., Smart Coding (Claude -> Gemini -> DeepSeek)' />
        </Form.Item>

        <Form.Item label='Description (optional)' field='description'>
          <Input placeholder='Brief explanation of when to use this combo' />
        </Form.Item>

        <Form.Item label='Routing Strategy' field='strategy' rules={[{ required: true }]}>
          <Radio.Group type='button'>
            <Radio value='priority'>Priority Waterfall (Auto-fallback on error/429)</Radio>
            <Radio value='round-robin'>Round-Robin (Load balancing across targets)</Radio>
          </Radio.Group>
        </Form.Item>

        <div className='mt-16px mb-8px flex items-center justify-between'>
          <div className='font-medium text-14px text-t-primary'>Fallback Chain Targets ({targets.length})</div>
          <Button type='outline' size='small' onClick={addTarget} disabled={accounts.length === 0}>
            + Add Target
          </Button>
        </div>

        {accounts.length === 0 ? (
          <div className='p-16px text-center text-t-secondary bg-fill-1 rd-8px'>
            Please connect at least one provider account first before creating combos.
          </div>
        ) : targets.length === 0 ? (
          <div className='p-16px text-center text-t-secondary bg-fill-1 rd-8px'>
            Click "+ Add Target" above to configure your primary and fallback models.
          </div>
        ) : (
          <div className='flex flex-col gap-8px max-h-260px overflow-y-auto pr-4px'>
            {targets.map((tgt, idx) => {
              const currentAcc = accounts.find((a) => a.id === tgt.accountId) || accounts[0];
              const availableModels = currentAcc?.models || [];

              return (
                <div key={idx} className='flex items-center gap-8px p-10px bg-fill-1 border border-border-1 rd-8px'>
                  <div className='w-24px h-24px rd-full bg-primary-1 text-primary-6 flex items-center justify-center font-bold text-12px flex-shrink-0'>
                    #{idx + 1}
                  </div>

                  <div className='flex-1 grid grid-cols-2 gap-8px'>
                    <Select
                      size='small'
                      value={tgt.accountId}
                      onChange={(accId) => {
                        const newAcc = accounts.find((a) => a.id === accId);
                        updateTarget(idx, {
                          accountId: accId,
                          model: newAcc?.models[0] || 'default',
                        });
                      }}
                    >
                      {accounts.map((acc) => (
                        <Select.Option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.platform})
                        </Select.Option>
                      ))}
                    </Select>

                    <Select size='small' value={tgt.model} onChange={(m) => updateTarget(idx, { model: m })}>
                      {availableModels.map((m) => (
                        <Select.Option key={m} value={m}>
                          {m}
                        </Select.Option>
                      ))}
                    </Select>
                  </div>

                  <div className='flex items-center gap-4px flex-shrink-0'>
                    <Button
                      type='text'
                      size='mini'
                      icon={<Up />}
                      disabled={idx === 0}
                      onClick={() => moveTarget(idx, 'up')}
                    />
                    <Button
                      type='text'
                      size='mini'
                      icon={<Down />}
                      disabled={idx === targets.length - 1}
                      onClick={() => moveTarget(idx, 'down')}
                    />
                    <Button
                      type='text'
                      status='danger'
                      size='mini'
                      icon={<Delete />}
                      onClick={() => removeTarget(idx)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Form>
    </Modal>
  );
};
