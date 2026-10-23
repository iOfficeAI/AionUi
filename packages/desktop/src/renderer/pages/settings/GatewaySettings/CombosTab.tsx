/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button, Card, Popconfirm, Switch, Tag } from '@arco-design/web-react';
import { Delete, Edit, Plus, Right, Switch as SwitchIcon } from '@icon-park/react';
import { ComboModal } from './ComboModal';
import type { GatewayAccount, GatewayCombo } from './types';

type CombosTabProps = {
  combos: GatewayCombo[];
  accounts: GatewayAccount[];
  onRefresh: () => void;
  onSaveCombo: (combo: GatewayCombo) => void;
  onDeleteCombo: (id: string) => void;
};

export const CombosTab: React.FC<CombosTabProps> = ({
  combos,
  accounts,
  onRefresh: _onRefresh,
  onSaveCombo,
  onDeleteCombo,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCombo, setEditingCombo] = useState<GatewayCombo | null>(null);

  const handleEdit = (combo: GatewayCombo) => {
    setEditingCombo(combo);
    setModalVisible(true);
  };

  const handleCreate = () => {
    setEditingCombo(null);
    setModalVisible(true);
  };

  const handleToggleEnable = (combo: GatewayCombo, checked: boolean) => {
    onSaveCombo({ ...combo, enabled: checked });
  };

  return (
    <div className='flex flex-col gap-16px'>
      <div className='flex items-center justify-between'>
        <div>
          <div className='text-16px font-600 text-t-primary'>Model Combos & Fallback Chains</div>
          <div className='text-12px text-t-secondary'>
            Combine multiple models into a virtual pipeline that automatically cascades to fallback models if the
            primary model hits a rate limit or error.
          </div>
        </div>
        <Button type='primary' size='small' icon={<Plus />} onClick={handleCreate}>
          Create Combo
        </Button>
      </div>

      {combos.length === 0 ? (
        <Card className='text-center py-40px bg-fill-1 rd-12px border border-border-1'>
          <div className='text-14px font-medium text-t-primary mb-6px'>No model combos created yet</div>
          <div className='text-12px text-t-secondary mb-16px'>
            Build fallback chains like "Claude 3.7 Sonnet ➔ Gemini 2.5 Pro ➔ DeepSeek R1" so your agent never gets
            blocked by rate limits.
          </div>
          <Button type='primary' icon={<Plus />} onClick={handleCreate} disabled={accounts.length === 0}>
            Create First Combo
          </Button>
        </Card>
      ) : (
        <div className='flex flex-col gap-12px'>
          {combos.map((combo) => (
            <Card
              key={combo.id}
              className='rd-12px border border-border-1 transition-shadow hover:shadow-md'
              bodyStyle={{ padding: '16px' }}
            >
              <div className='flex items-start justify-between gap-12px mb-12px'>
                <div>
                  <div className='flex items-center gap-8px flex-wrap mb-4px'>
                    <span className='font-600 text-16px text-t-primary'>{combo.name}</span>
                    <Tag color={combo.strategy === 'priority' ? 'blue' : 'purple'} size='small'>
                      {combo.strategy === 'priority' ? 'Priority Waterfall' : 'Round-Robin Balance'}
                    </Tag>
                    <Tag color='gray' size='small' className='font-mono'>
                      id: {combo.name}
                    </Tag>
                  </div>
                  {combo.description && <div className='text-13px text-t-secondary'>{combo.description}</div>}
                </div>
                <div className='flex items-center gap-8px'>
                  <Switch
                    size='small'
                    checked={combo.enabled}
                    onChange={(checked) => handleToggleEnable(combo, checked)}
                  />
                  <Button type='text' size='small' icon={<Edit />} onClick={() => handleEdit(combo)}>
                    Edit
                  </Button>
                  <Popconfirm title='Are you sure you want to remove this combo?' onOk={() => onDeleteCombo(combo.id)}>
                    <Button type='text' status='danger' size='small' icon={<Delete />}>
                      Delete
                    </Button>
                  </Popconfirm>
                </div>
              </div>

              {/* Pipeline Sequence Visualization */}
              <div className='p-12px bg-fill-1 rd-8px border border-border-1'>
                <div className='text-11px text-t-secondary uppercase font-semibold mb-8px tracking-wider flex items-center gap-6px'>
                  <SwitchIcon /> Fallback Chain ({combo.targets.length} steps)
                </div>
                <div className='flex items-center gap-8px flex-wrap'>
                  {combo.targets.map((tgt, idx) => {
                    const acc = accounts.find((a) => a.id === tgt.accountId);
                    const isPrimary = idx === 0;

                    return (
                      <React.Fragment key={idx}>
                        <div
                          className={`flex items-center gap-8px px-10px py-6px rd-6px border text-12px ${
                            isPrimary
                              ? 'bg-primary-1 border-primary-3 text-primary-7 font-medium'
                              : 'bg-fill-2 border-border-2 text-t-primary'
                          }`}
                        >
                          <span className='w-18px h-18px rd-full bg-white dark:bg-black flex items-center justify-center font-bold text-10px shadow-xs'>
                            {idx + 1}
                          </span>
                          <span>{acc?.name || 'Unknown Account'}</span>
                          <span className='opacity-40'>·</span>
                          <span className='font-mono font-medium'>{tgt.model}</span>
                          {isPrimary && (
                            <span className='text-10px px-4px py-1px bg-primary-6 text-white rd-4px'>PRIMARY</span>
                          )}
                        </div>

                        {idx < combo.targets.length - 1 && (
                          <Right theme='outline' size='14' className='text-t-secondary' />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ComboModal
        visible={modalVisible}
        combo={editingCombo}
        accounts={accounts}
        onClose={() => setModalVisible(false)}
        onSave={onSaveCombo}
      />
    </div>
  );
};
