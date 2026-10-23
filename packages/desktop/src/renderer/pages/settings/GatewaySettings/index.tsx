/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Message, Tabs, Tag } from '@arco-design/web-react';
import { CheckOne, Connection, Dashboard, Lightning, List, Switch as SwitchIcon } from '@icon-park/react';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { AccountsTab } from './AccountsTab';
import { CombosTab } from './CombosTab';
import { TelemetryLogsTab } from './TelemetryLogsTab';
import { QuotaTab } from './QuotaTab';
import type { GatewayAccount, GatewayCombo, GatewayStatus } from './types';

const GatewaySettings: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('accounts');
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [accounts, setAccounts] = useState<GatewayAccount[]>([]);
  const [combos, setCombos] = useState<GatewayCombo[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [omniRouteOnline, setOmniRouteOnline] = useState<boolean | null>(null);

  const loadData = async () => {
    if (!window.electronAPI) return;

    if (window.electronAPI.gatewayGetStatus) {
      try {
        const res = await window.electronAPI.gatewayGetStatus();
        if (res.success && res.data) setStatus(res.data);
      } catch (err) {
        console.error('[GatewaySettings] Failed to fetch status:', err);
      }
    }

    if (window.electronAPI.gatewayGetAccounts) {
      try {
        const res = await window.electronAPI.gatewayGetAccounts();
        if (res.success && res.data) setAccounts(res.data);
      } catch (err) {
        console.error('[GatewaySettings] Failed to fetch accounts:', err);
      }
    }

    if (window.electronAPI.gatewayGetCombos) {
      try {
        const res = await window.electronAPI.gatewayGetCombos();
        if (res.success && res.data) setCombos(res.data);
      } catch (err) {
        console.error('[GatewaySettings] Failed to fetch combos:', err);
      }
    }

    if (window.electronAPI.gatewayCheckOmniRouteStatus) {
      try {
        const res = await window.electronAPI.gatewayCheckOmniRouteStatus();
        setOmniRouteOnline(Boolean(res.isRunning));
      } catch {
        setOmniRouteOnline(false);
      }
    }
  };

  useEffect(() => {
    loadData();

    if (window.electronAPI?.onGatewayQuotaUpdated) {
      const unsubscribe = window.electronAPI.onGatewayQuotaUpdated((updatedAcc) => {
        const acc = updatedAcc as GatewayAccount;
        setAccounts((prev) => prev.map((a) => (a.id === acc.id ? acc : a)));
      });
      return () => {
        unsubscribe();
      };
    }
    return undefined;
  }, []);

  const handleSyncLocalOmniRoute = async () => {
    if (!window.electronAPI?.gatewaySyncLocalOmniRoute) {
      Message.warning('Sync is only available in desktop application mode');
      return;
    }
    setIsSyncing(true);
    try {
      const res = await window.electronAPI.gatewaySyncLocalOmniRoute();
      if (res.success && res.data) {
        Message.success(
          res.data.message ||
            `Synced ${res.data.importedAccounts} accounts and ${res.data.importedCombos} combos successfully!`
        );
        loadData();
      } else {
        Message.error(res.error || 'Failed to sync local accounts');
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      Message.error(`Sync error: ${errorMsg}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveAccount = async (account: GatewayAccount) => {
    if (window.electronAPI?.gatewaySaveAccount) {
      await window.electronAPI.gatewaySaveAccount(account);
      loadData();
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (window.electronAPI?.gatewayDeleteAccount) {
      await window.electronAPI.gatewayDeleteAccount(id);
      loadData();
    }
  };

  const handleSaveCombo = async (combo: GatewayCombo) => {
    if (window.electronAPI?.gatewaySaveCombo) {
      await window.electronAPI.gatewaySaveCombo(combo);
      loadData();
    }
  };

  const handleDeleteCombo = async (id: string) => {
    if (window.electronAPI?.gatewayDeleteCombo) {
      await window.electronAPI.gatewayDeleteCombo(id);
      loadData();
    }
  };

  return (
    <SettingsPageWrapper contentClassName='max-w-1150px'>
      <div className='flex flex-col gap-18px'>
        {/* Model Provider Hub Header */}
        <div className='flex items-center justify-between flex-wrap gap-16px pb-16px border-b border-border-2'>
          <div>
            <div className='flex items-center gap-10px mb-4px'>
              <span className='text-22px font-700 text-t-primary leading-32px'>
                {t('settings.modelProviderHub', { defaultValue: 'Model Provider Hub' })}
              </span>
              <Tag color='arcoblue' size='small' className='font-600'>
                Multi-Provider Gateway
              </Tag>
              {omniRouteOnline ? (
                <Tag color='green' size='small' className='flex items-center gap-4px'>
                  <span className='w-6px h-6px rounded-full bg-success inline-block animate-pulse' />
                  Local Daemon Online · :20128
                </Tag>
              ) : omniRouteOnline === false ? (
                <Tag color='gold' size='small'>
                  Local Daemon Standby
                </Tag>
              ) : null}
            </div>
            <div className='text-13px text-t-secondary max-w-720px'>
              Connect multiple accounts per provider (Google Antigravity, Claude, OpenAI, Cursor, DeepSeek), build smart
              auto-failover combos, and balance token loads across sessions.
            </div>
          </div>
          <div className='flex items-center gap-10px'>
            <Button
              type='primary'
              icon={<Lightning />}
              loading={isSyncing}
              onClick={handleSyncLocalOmniRoute}
              className='bg-primary font-500 shadow-sm'
            >
              ⚡ Sync Local Accounts
            </Button>
            <Tag color='arcoblue' icon={<CheckOne />} className='px-10px py-6px text-12px font-medium'>
              Router Port: {status?.port || 13408}
            </Tag>
          </div>
        </div>

        {/* Tab Navigation */}
        <Tabs activeTab={activeTab} onChange={setActiveTab} type='capsule'>
          <Tabs.TabPane
            key='accounts'
            title={
              <span className='flex items-center gap-6px'>
                <Connection /> Accounts
                <Badge count={accounts.length} dotStyle={{ backgroundColor: 'rgb(var(--primary-6))' }} />
              </span>
            }
          >
            <AccountsTab
              accounts={accounts}
              onRefresh={loadData}
              onSaveAccount={handleSaveAccount}
              onDeleteAccount={handleDeleteAccount}
              onSyncLocal={handleSyncLocalOmniRoute}
              isSyncing={isSyncing}
            />
          </Tabs.TabPane>

          <Tabs.TabPane
            key='combos'
            title={
              <span className='flex items-center gap-6px'>
                <SwitchIcon /> Combos &amp; Failover
                <Badge count={combos.length} dotStyle={{ backgroundColor: 'rgb(var(--primary-6))' }} />
              </span>
            }
          >
            <CombosTab
              combos={combos}
              accounts={accounts}
              onRefresh={loadData}
              onSaveCombo={handleSaveCombo}
              onDeleteCombo={handleDeleteCombo}
            />
          </Tabs.TabPane>

          <Tabs.TabPane
            key='logs'
            title={
              <span className='flex items-center gap-6px'>
                <List /> Token Logs (Telemetry)
              </span>
            }
          >
            <TelemetryLogsTab />
          </Tabs.TabPane>

          <Tabs.TabPane
            key='quota'
            title={
              <span className='flex items-center gap-6px'>
                <Dashboard /> Quota &amp; Limits
              </span>
            }
          >
            <QuotaTab accounts={accounts} onRefresh={loadData} />
          </Tabs.TabPane>
        </Tabs>
      </div>
    </SettingsPageWrapper>
  );
};

export default GatewaySettings;
