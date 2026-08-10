/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Message, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { acpConversation } from '@/common/adapter/ipcBridge';
import { formatManagedAgentDiagnosticMessage, type ManagedAgent } from '@/renderer/utils/model/agentTypes';
import EnvVarEditor, { type EnvVarRow } from './EnvVarEditor';
import { uuid } from '@/common/utils';

type AgentRepairPanelProps = {
  agent: ManagedAgent;
  onSaved: () => void;
};

// The diagnostic banner gives the page context: what state the agent is in,
// why, and which field below to act on. It also corrects the common
// misconception that "online" means "ready to use" — online only means a
// connection handshake succeeded, not that the agent is logged in/authorized.
type DiagnosticBanner = {
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  content: string;
};

const resolveDiagnosticBanner = (t: ReturnType<typeof useTranslation>['t'], agent: ManagedAgent): DiagnosticBanner => {
  const diagnostics = formatManagedAgentDiagnosticMessage(t, agent);
  switch (agent.status) {
    case 'missing':
      return {
        type: 'error',
        title: t('settings.repair.missingTitle'),
        content: diagnostics || t('settings.repair.missingHint'),
      };
    case 'offline':
      return {
        type: 'warning',
        title: t('settings.repair.offlineTitle'),
        content: diagnostics || t('settings.repair.offlineHint'),
      };
    case 'online':
      return {
        type: 'success',
        title: t('settings.repair.onlineTitle'),
        content: t('settings.repair.onlineHint'),
      };
    default:
      // 'unchecked' (never connection-tested) and any future/unknown status.
      // Must NOT fall through to the success banner — that would claim the
      // agent is "connected" when we have never probed it (the list correctly
      // shows it as unchecked, so the two views would disagree otherwise).
      return {
        type: 'info',
        title: t('settings.repair.uncheckedTitle'),
        content: t('settings.repair.uncheckedHint'),
      };
  }
};

const showSaveAndTestResult = (t: ReturnType<typeof useTranslation>['t'], result: ManagedAgent) => {
  switch (result.status) {
    case 'online':
      Message.success(t('settings.agentManagement.testConnectionOnline', { name: result.name }));
      break;
    case 'missing':
      Message.warning(t('settings.agentManagement.testConnectionMissing', { name: result.name }));
      break;
    case 'offline':
      Message.warning(
        formatManagedAgentDiagnosticMessage(t, result) ||
          (result.last_check_error_code === 'auth_required'
            ? t('settings.agentManagement.testConnectionAuth', { name: result.name })
            : t('settings.agentManagement.testConnectionOffline', { name: result.name }))
      );
      break;
    default:
      break;
  }
};

const AgentRepairPanel: React.FC<AgentRepairPanelProps> = ({ agent, onSaved }) => {
  const { t } = useTranslation();
  const [commandOverride, setCommandOverride] = useState('');
  const [envRows, setEnvRows] = useState<EnvVarRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const initialHasOverridesRef = useRef(false);
  const isInternalAionCli = agent.agent_type === 'aionrs' && agent.agent_source === 'internal';

  // Load current overrides on mount. The repair page is itself the explicit
  // entry point, so there's no separate unlock step.
  useEffect(() => {
    if (isInternalAionCli) return;

    let cancelled = false;
    void (async () => {
      try {
        const overrides = await acpConversation.getAgentOverrides.invoke({ id: agent.id });
        if (cancelled) return;
        const loadedCommandOverride = overrides.command_override || '';
        const loadedEnvOverride = overrides.env_override || [];
        initialHasOverridesRef.current =
          Boolean(loadedCommandOverride.trim()) || loadedEnvOverride.some((env) => Boolean(env.name.trim()));
        setCommandOverride(loadedCommandOverride);
        setEnvRows(loadedEnvOverride.map((env) => ({ id: uuid(), key: env.name, value: env.value })));
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch agent overrides:', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agent.id, isInternalAionCli]);

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

    const envOverride = envRows
      .filter((row) => row.key.trim())
      .map((row) => ({ name: row.key.trim(), value: row.value }));
    const hasCurrentOverrides = Boolean(commandOverride.trim()) || envOverride.length > 0;
    if (!hasCurrentOverrides && !initialHasOverridesRef.current) {
      setError(t('settings.repair.emptyOverridesError'));
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setError('');

    try {
      // Backend uses whole-replace semantics: setAgentOverrides overwrites BOTH command_override
      // and env_override columns from the request body. Missing/empty/null command_override is
      // written as None (cleared), so reset-path-then-save correctly clears the override.
      const result = await acpConversation.setAgentOverrides.invoke({
        id: agent.id,
        command_override: commandOverride.trim() || undefined,
        env_override: envOverride.length > 0 ? envOverride : undefined,
      });

      showSaveAndTestResult(t, result);
      onSaved();
    } catch (err) {
      console.error('Failed to save agent overrides:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [agent.id, commandOverride, envRows, isSaving, onSaved, t]);

  const banner = resolveDiagnosticBanner(t, agent);

  // A launch-path override only makes sense for direct-CLI agents. Bridge-launched
  // rows (e.g. `npx`) keep the bridge's own arguments (`-y <package> …`) in `args`;
  // pointing the launch path at a resolved binary would forward those bridge args to
  // it (e.g. `kilo.cmd -y @kilocode/cli acp`) and break startup. Never offer the
  // field for them — the backend also rejects such overrides.
  const sourceInfo = agent.agent_source_info;
  const isBridgeLaunched = Boolean(sourceInfo?.bridge_binary && sourceInfo.bridge_binary !== sourceInfo.binary_name);

  // Only surface the actionable fields (launch path, env vars, Save & Test) once
  // a check has run. While the agent is still `unchecked` we deliberately show
  // nothing but a hint pointing to Test Connection: the launch path may well be
  // correct, and env-var editing is only a last-resort fallback (we'd rather the
  // user resolve login in their terminal). Anything other than a known
  // online/offline/missing status is treated as not-yet-actionable.
  const isActionable = agent.status === 'online' || agent.status === 'offline' || agent.status === 'missing';

  // The launch-path override is only the right lever once a check has actually
  // failed: `missing` (command not found on the default path) or `offline`
  // (found but couldn't connect). For `online` it was already resolved.
  // Bridge-launched (npx) rows never expose it (their args belong to the bridge).
  const showPath = !isBridgeLaunched && (agent.status === 'missing' || agent.status === 'offline');

  const pathBlock = (
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
  );

  const envBlock = (
    <div>
      <Typography.Text className='mb-6px block text-13px font-medium text-t-primary'>
        {t('settings.repair.envLabel')}
      </Typography.Text>
      <Typography.Text type='secondary' className='mb-6px block text-11px leading-16px text-t-tertiary'>
        {t('settings.repair.envHelp')}
      </Typography.Text>
      {/* What configuring env vars can fix — grounded in how AionUi injects them
          per-agent at spawn time. Deliberately excludes OAuth login (stored in
          the CLI's own config, not reachable via env), called out in envOauthNote. */}
      <div className='mb-8px rounded-6px bg-aou-2 px-10px py-8px'>
        <Typography.Text className='block text-11px font-medium text-t-secondary'>
          {t('settings.repair.envScenariosTitle')}
        </Typography.Text>
        <ul className='my-4px pl-16px text-11px leading-18px text-t-tertiary'>
          <li>{t('settings.repair.envScenarioApiKey')}</li>
          <li>{t('settings.repair.envScenarioBaseUrl')}</li>
          <li>{t('settings.repair.envScenarioProxy')}</li>
        </ul>
        <Typography.Text className='block text-11px leading-16px text-t-tertiary'>
          {t('settings.repair.envOauthNote')}
        </Typography.Text>
      </div>
      <EnvVarEditor value={envRows} onChange={setEnvRows} />
    </div>
  );

  return (
    <div className='mt-10px flex flex-col gap-12px rounded-10px bg-aou-1 px-12px py-12px'>
      {/* Status-aware diagnostic banner: explains where the agent stands and
          which field below to use. */}
      <Alert type={banner.type} title={banner.title} content={banner.content} className='!rounded-8px' />

      {!isInternalAionCli && isActionable && showPath ? pathBlock : null}
      {!isInternalAionCli && isActionable ? envBlock : null}

      {/* Error Alert */}
      {error && <Alert type='error' content={error} closable onClose={() => setError('')} className='!rounded-8px' />}

      {/* Save Button — only once the agent is actionable (checked). While
          unchecked we show just the banner and steer the user to Test Connection. */}
      {!isInternalAionCli && isActionable ? (
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
      ) : null}
    </div>
  );
};

export default AgentRepairPanel;
