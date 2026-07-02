/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from 'react';
import { Button, Input } from '@arco-design/web-react';
import { Plus, Delete, PreviewOpen, PreviewClose } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { uuid } from '@/common/utils';

export type EnvVarRow = { id: string; key: string; value: string };

type EnvVarEditorProps = {
  value: EnvVarRow[];
  onChange: (rows: EnvVarRow[]) => void;
};

const EnvVarEditor: React.FC<EnvVarEditorProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());

  const handleAdd = useCallback(() => {
    onChange([...value, { id: uuid(), key: '', value: '' }]);
  }, [value, onChange]);

  const handleRemove = useCallback(
    (id: string) => {
      onChange(value.filter((v) => v.id !== id));
    },
    [value, onChange]
  );

  const handleUpdateKey = useCallback(
    (id: string, key: string) => {
      onChange(value.map((v) => (v.id === id ? { ...v, key } : v)));
    },
    [value, onChange]
  );

  const handleUpdateValue = useCallback(
    (id: string, newValue: string) => {
      onChange(value.map((v) => (v.id === id ? { ...v, value: newValue } : v)));
    },
    [value, onChange]
  );

  const toggleVisibility = useCallback((id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div>
      <div className='flex flex-col gap-10px'>
        {value.map((envVar) => {
          const isVisible = visibleIds.has(envVar.id);
          return (
            <div
              key={envVar.id}
              className='grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto_auto] items-center gap-8px'
            >
              <Input
                size='large'
                value={envVar.key}
                onChange={(v) => handleUpdateKey(envVar.id, v)}
                placeholder={t('settings.envKeyPlaceholder')}
              />
              <Input
                size='large'
                type={isVisible ? 'text' : 'password'}
                value={envVar.value}
                onChange={(v) => handleUpdateValue(envVar.id, v)}
                placeholder={t('settings.envValuePlaceholder')}
              />
              <Button
                type='text'
                size='small'
                icon={
                  isVisible ? <PreviewClose theme='outline' size={16} /> : <PreviewOpen theme='outline' size={16} />
                }
                onClick={() => toggleVisibility(envVar.id)}
                className='!h-36px !w-36px !rounded-10px !px-0 text-t-tertiary hover:text-t-secondary'
              />
              <Button
                type='text'
                size='small'
                icon={<Delete theme='outline' size={16} />}
                onClick={() => handleRemove(envVar.id)}
                className='!h-36px !w-36px !rounded-10px !px-0 text-t-tertiary hover:text-danger'
              />
            </div>
          );
        })}
      </div>
      <Button
        type='text'
        size='small'
        icon={<Plus theme='outline' size={14} />}
        onClick={handleAdd}
        className='mt-8px !px-0 text-t-secondary hover:!text-primary-6'
      >
        {t('settings.addEnvVar')}
      </Button>
    </div>
  );
};

export default EnvVarEditor;
