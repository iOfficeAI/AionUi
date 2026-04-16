import React, { useEffect, useState } from 'react';
import { Select } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import { getTeamAvailableModels, type TeamAvailableModel } from '@/common/utils/teamModelUtils';

type Props = {
  backend: string;
  value: string | undefined;
  onChange: (model: string | undefined) => void;
  label?: string;
};

const TeamModelSelect: React.FC<Props> = ({ backend, value, onChange, label }) => {
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<TeamAvailableModel[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      ConfigStorage.get('acp.cachedModels'),
      ipcBridge.mode.getModelConfig.invoke(),
      ipcBridge.googleAuth.status.invoke({ proxy: undefined }).then((r) => r.success),
    ]).then(([cachedModels, providers, isGoogleAuth]) => {
      if (!active) return;
      setModels(getTeamAvailableModels(backend, cachedModels, providers, isGoogleAuth));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [backend]);

  if (loading || models.length === 0) return null;

  return (
    <div className='flex flex-col gap-6px'>
      {label && <label className='text-sm text-[var(--color-text-2)] font-medium'>{label}</label>}
      <Select placeholder='(default)' allowClear value={value} onChange={onChange}>
        {models.map((m) => (
          <Select.Option key={m.id} value={m.id}>
            {m.label}
          </Select.Option>
        ))}
      </Select>
    </div>
  );
};

export default TeamModelSelect;
