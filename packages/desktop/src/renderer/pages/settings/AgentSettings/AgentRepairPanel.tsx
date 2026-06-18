/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useRef, useState } from 'react';
import { Alert, Button, Input, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { acpConversation } from '@/common/adapter/ipcBridge';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import EnvVarEditor, { type EnvVarRow } from './EnvVarEditor';
import { uuid } from '@/common/utils';

type AgentRepairPanelProps = {
  agent: ManagedAgent;
  onSaved: () => void;
};

const AgentRepairPanel: React.FC<AgentRepairPanelProps> = ({ agent, onSaved }) => {
  const { t } = useTranslation();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [commandOverride, setCommandOverride] = useState('');
  const [envRows, setEnvRows] = useState<EnvVarRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);

  const handleUnlock = useCallback(async () => {
    try {
      const overrides = await acpConversation.getAgentOverrides.invoke({ id: agent.id });
      setCommandOverride(overrides.command_override || '');
      const rows = (overrides.env_override || []).map((env) => ({
        id: uuid(),
        key: env.name,
        value: env.value,
      }));
      setEnvRows(rows);
      setIsUnlocked(true);
      setError('');
    } catch (err) {
      console.error('Failed to fetch agent overrides:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agent.id]);

  const handleReset = useCallback(() => {
    setCommandOverride('');
  }, []);

  const handleSave = useCallback(async () => {
    if (savingRef.current || isSaving) return;

    // Check for duplicate keys
    const keys = envRows.map((row) => row.key.trim()).filter(Boolean);
    const uniqueKeys = new Set(keys);
    if (keys.length !== uniqueKeys.size) {
      setError(t('settings.repair.duplicateKeysError'));
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setError('');

    try {
      const envOverride = envRows
        .filter((row) => row.key.trim())
        .map((row) => ({ name: row.key.trim(), value: row.value }));

      // Backend uses whole-replace semantics: setAgentOverrides overwrites BOTH command_override
      // and env_override columns from the request body. Missing/empty/null command_override is
      // written as None (cleared), so reset-path-then-save correctly clears the override.
      await acpConversation.setAgentOverrides.invoke({
        id: agent.id,
        command_override: commandOverride.trim() || undefined,
        env_override: envOverride.length > 0 ? envOverride : undefined,
      });

      onSaved();
    } catch (err) {
      console.error('Failed to save agent overrides:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [agent.id, commandOverride, envRows, isSaving, onSaved, t]);

  if (!isUnlocked) {
    return (
      <div className='mt-10px flex flex-col gap-10px rounded-10px bg-aou-1 px-12px py-10px'>
        <div className='text-12px text-t-secondary'>
          {agent.env_override_key_count !== undefined && agent.env_override_key_count > 0 && (
            <div>{t('settings.repair.configuredVarsCount', { count: agent.env_override_key_count })}</div>
          )}
          {agent.has_command_override && <div>{t('settings.repair.hasPathOverride')}</div>}
        </div>
        <Button size='small' type='secondary' onClick={handleUnlock} className='!rounded-8px'>
          {t('settings.repair.unlockAndEdit')}
        </Button>
      </div>
    );
  }

  return (
    <div className='mt-10px flex flex-col gap-12px rounded-10px bg-aou-1 px-12px py-12px'>
      {/* Path Override */}
      <div>
        <div className='mb-6px flex items-center justify-between'>
          <Typography.Text className='block text-13px font-medium text-t-primary'>
            {t('settings.repair.pathLabel')}
          </Typography.Text>
          <Button type='text' size='mini' onClick={handleReset} className='!h-auto !px-0 text-12px text-t-secondary'>
            {t('settings.repair.resetPath')}
          </Button>
        </div>
        <Input
          size='large'
          value={commandOverride}
          onChange={setCommandOverride}
          placeholder={t('settings.repair.pathPlaceholder', { command: agent.command || '' })}
        />
        <Typography.Text type='secondary' className='mt-4px block text-11px leading-16px text-t-tertiary'>
          {t('settings.repair.pathHelp')}
        </Typography.Text>
      </div>

      {/* Environment Variables */}
      <div>
        <Typography.Text className='mb-6px block text-13px font-medium text-t-primary'>
          {t('settings.repair.envLabel')}
        </Typography.Text>
        <Typography.Text type='secondary' className='mb-8px block text-11px leading-16px text-t-tertiary'>
          {t('settings.repair.envHelp')}
        </Typography.Text>
        <EnvVarEditor value={envRows} onChange={setEnvRows} />
      </div>

      {/* Error Alert */}
      {error && (
        <Alert type='error' content={error} closable onClose={() => setError('')} className='!rounded-8px' />
      )}

      {/* Save Button */}
      <Button
        type='primary'
        size='large'
        disabled={isSaving}
        loading={isSaving}
        onClick={handleSave}
        className='!rounded-8px'
      >
        {t('settings.repair.saveAndTest')}
      </Button>
    </div>
  );
};

export default AgentRepairPanel;
