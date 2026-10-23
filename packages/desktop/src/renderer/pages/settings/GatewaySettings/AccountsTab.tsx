/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Button, Card, Input, Message, Popconfirm, Switch, Tag, Tooltip } from '@arco-design/web-react';
import { CheckOne, Delete, Edit, Lightning, Plus, Refresh, Search, Time } from '@icon-park/react';
import { ProviderLogo } from '@/renderer/components/agent/ThemedLogo';
import { buildLogoAssetUrl } from '@/renderer/utils/model/modelPlatforms';
import { AccountModal } from './AccountModal';
import type { GatewayAccount, GatewayPlatform } from './types';

type AccountsTabProps = {
  accounts: GatewayAccount[];
  onRefresh: () => void;
  onSaveAccount: (account: GatewayAccount) => void;
  onDeleteAccount: (id: string) => void;
  onSyncLocal?: () => void;
  isSyncing?: boolean;
};

type QuickProviderCard = {
  id: string;
  name: string;
  platform: GatewayPlatform;
  desc: string;
  logo: string;
  badge?: string;
};

const QUICK_PROVIDERS: QuickProviderCard[] = [
  {
    id: 'antigravity',
    name: 'Google Antigravity',
    platform: 'omniroute',
    desc: 'Google OAuth · Claude Sonnet & Opus · Gemini 3.8',
    logo: buildLogoAssetUrl('ai-major/gemini.svg'),
    badge: '9 Local Accounts',
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    platform: 'anthropic',
    desc: 'Claude 3.7 Sonnet · Opus Thinking · Native API',
    logo: buildLogoAssetUrl('ai-major/anthropic.svg'),
  },
  {
    id: 'openai',
    name: 'OpenAI',
    platform: 'openai',
    desc: 'GPT-4o · o1 · o3-mini · OpenAI API',
    logo: buildLogoAssetUrl('ai-major/openai.svg'),
  },
  {
    id: 'cursor',
    name: 'Cursor AI',
    platform: 'omniroute',
    desc: 'Cursor Multi-Session Bridge & Proxy',
    logo: buildLogoAssetUrl('ai-cloud/newapi.svg'),
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    platform: 'deepseek',
    desc: 'DeepSeek-V3 & DeepSeek-R1 Reasoner',
    logo: buildLogoAssetUrl('ai-cloud/deepseek.svg'),
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    platform: 'groq',
    desc: 'Ultra-Fast Inference · Llama 3.3 70B',
    logo: buildLogoAssetUrl('ai-cloud/groq.svg'),
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    platform: 'openrouter',
    desc: 'Unified Gateway to 300+ Global Models',
    logo: buildLogoAssetUrl('ai-cloud/openrouter.svg'),
  },
  {
    id: 'custom',
    name: 'Local / Ollama',
    platform: 'custom',
    desc: 'Local LLMs · Ollama · vLLM · Custom URL',
    logo: buildLogoAssetUrl('ai-cloud/ollama.svg'),
  },
];

export const AccountsTab: React.FC<AccountsTabProps> = ({
  accounts,
  onRefresh,
  onSaveAccount,
  onDeleteAccount,
  onSyncLocal,
  isSyncing = false,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<GatewayAccount | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<GatewayPlatform>('omniroute');
  const [searchQuery, setSearchQuery] = useState('');

  const handleEdit = (acc: GatewayAccount) => {
    setEditingAccount(acc);
    setSelectedPlatform(acc.platform);
    setModalVisible(true);
  };

  const handleCreateForPlatform = (platform: GatewayPlatform) => {
    setEditingAccount(null);
    setSelectedPlatform(platform);
    setModalVisible(true);
  };

  const handleToggleEnable = (acc: GatewayAccount, checked: boolean) => {
    onSaveAccount({ ...acc, enabled: checked, status: checked ? 'active' : 'disabled' });
  };

  const handleResetCooldown = async (accId: string) => {
    if (window.electronAPI?.gatewayResetCooldown) {
      await window.electronAPI.gatewayResetCooldown(accId);
      Message.success('Rate limit cooldown reset successfully');
      onRefresh();
    }
  };

  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accounts;
    const q = searchQuery.toLowerCase();
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.platform.toLowerCase().includes(q) ||
        a.baseUrl.toLowerCase().includes(q) ||
        a.models.some((m) => m.toLowerCase().includes(q))
    );
  }, [accounts, searchQuery]);

  // Count accounts by platform
  const antigravityCount = accounts.filter(
    (a) => a.platform === 'omniroute' || a.name.toLowerCase().includes('antigravity')
  ).length;

  return (
    <div className='flex flex-col gap-20px'>
      {/* Provider Quick-Connect Section */}
      <div className='flex flex-col gap-10px'>
        <div className='flex items-center justify-between'>
          <div>
            <div className='text-15px font-600 text-t-primary'>Supported Providers</div>
            <div className='text-12px text-t-secondary'>
              Connect provider accounts directly or click ⚡ Sync Local Accounts to automatically import all your local
              Google Antigravity &amp; Claude sessions.
            </div>
          </div>
          {onSyncLocal && (
            <Button
              type='primary'
              size='small'
              loading={isSyncing}
              icon={<Lightning />}
              onClick={onSyncLocal}
              className='bg-primary font-500'
            >
              ⚡ Sync Local Accounts
            </Button>
          )}
        </div>

        <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-12px'>
          {QUICK_PROVIDERS.map((prov) => {
            const isAntigravity = prov.id === 'antigravity';
            const count = isAntigravity
              ? antigravityCount
              : accounts.filter((a) => a.platform === prov.platform).length;

            return (
              <div
                key={prov.id}
                onClick={() => handleCreateForPlatform(prov.platform)}
                className='p-12px rd-10px border border-border-2 bg-fill-2 hover:bg-fill-3 hover:border-primary/50 transition-all cursor-pointer flex flex-col justify-between gap-10px'
              >
                <div className='flex items-start justify-between gap-8px'>
                  <div className='flex items-center gap-8px min-w-0'>
                    <ProviderLogo logo={prov.logo} name={prov.name} size={22} />
                    <span className='font-600 text-13px text-t-primary truncate'>{prov.name}</span>
                  </div>
                  {count > 0 ? (
                    <Tag color='green' size='small' className='text-10px px-6px py-0'>
                      {count} Connected
                    </Tag>
                  ) : prov.badge ? (
                    <Tag color='arcoblue' size='small' className='text-10px px-6px py-0'>
                      {prov.badge}
                    </Tag>
                  ) : null}
                </div>
                <div className='text-11px text-t-secondary line-clamp-2 leading-16px'>{prov.desc}</div>
                <div className='flex items-center justify-between pt-6px border-t border-border-1 text-11px font-500 text-primary'>
                  <span>+ Connect Account</span>
                  <span>→</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Connected Accounts Section */}
      <div className='flex flex-col gap-12px'>
        <div className='flex items-center justify-between flex-wrap gap-8px'>
          <div className='flex items-center gap-8px'>
            <span className='text-15px font-600 text-t-primary'>Connected Accounts</span>
            <Tag color='arcoblue' size='small'>
              {accounts.length} total
            </Tag>
          </div>

          <div className='flex items-center gap-8px'>
            <Input
              size='small'
              prefix={<Search />}
              placeholder='Search accounts or models...'
              value={searchQuery}
              onChange={setSearchQuery}
              allowClear
              className='w-220px'
            />
            <Button type='secondary' size='small' icon={<Refresh />} onClick={onRefresh}>
              Refresh
            </Button>
            <Button type='outline' size='small' icon={<Plus />} onClick={() => handleCreateForPlatform('omniroute')}>
              Add Account
            </Button>
          </div>
        </div>

        {accounts.length === 0 ? (
          <Card className='text-center py-40px bg-fill-1 rd-12px border border-border-1'>
            <div className='text-14px font-medium text-t-primary mb-6px'>No accounts connected yet</div>
            <div className='text-12px text-t-secondary mb-16px max-w-480px mx-auto'>
              Click <strong>&quot;⚡ Sync Local Accounts&quot;</strong> to automatically load your existing Google
              Antigravity and Claude sessions, or click any provider card above to connect a new account.
            </div>
            {onSyncLocal ? (
              <Button type='primary' loading={isSyncing} icon={<Lightning />} onClick={onSyncLocal}>
                ⚡ Sync Local Accounts Now
              </Button>
            ) : (
              <Button type='primary' icon={<Plus />} onClick={() => handleCreateForPlatform('omniroute')}>
                Connect First Account
              </Button>
            )}
          </Card>
        ) : filteredAccounts.length === 0 ? (
          <div className='text-center py-32px text-t-secondary text-13px'>
            No accounts matching &quot;{searchQuery}&quot;
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-14px'>
            {filteredAccounts.map((acc) => {
              const isCooldown = Boolean(acc.cooldownUntil && acc.cooldownUntil > Date.now());
              const remainingSec = isCooldown
                ? Math.max(0, Math.round(((acc.cooldownUntil ?? 0) - Date.now()) / 1000))
                : 0;

              return (
                <Card
                  key={acc.id}
                  className='rd-12px border border-border-1 transition-shadow hover:shadow-sm'
                  bodyStyle={{ padding: '14px 16px' }}
                >
                  <div className='flex items-start justify-between gap-8px mb-10px'>
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center gap-8px flex-wrap mb-3px'>
                        <span className='font-600 text-14px text-t-primary truncate'>{acc.name}</span>
                        <Tag color='arcoblue' size='small'>
                          {acc.platform.toUpperCase()}
                        </Tag>
                        {acc.status === 'rate_limited' || isCooldown ? (
                          <Tag color='gold' size='small' icon={<Time />}>
                            Cooldown ({remainingSec}s)
                          </Tag>
                        ) : acc.enabled ? (
                          <Tag color='green' size='small' icon={<CheckOne />}>
                            Active
                          </Tag>
                        ) : (
                          <Tag color='gray' size='small'>
                            Disabled
                          </Tag>
                        )}
                      </div>
                      <div className='text-11px text-t-secondary truncate font-mono'>{acc.baseUrl}</div>
                    </div>
                    <Switch
                      size='small'
                      checked={acc.enabled}
                      onChange={(checked) => handleToggleEnable(acc, checked)}
                    />
                  </div>

                  <div className='mb-10px'>
                    <div className='text-10px text-t-secondary mb-4px uppercase font-medium tracking-wide flex items-center justify-between'>
                      <span>Configured Models ({acc.models.length})</span>
                    </div>
                    <div className='flex flex-wrap gap-4px max-h-52px overflow-y-auto'>
                      {acc.models.slice(0, 4).map((m) => (
                        <Tag key={m} size='small' className='text-11px font-mono bg-fill-2'>
                          {m}
                        </Tag>
                      ))}
                      {acc.models.length > 4 && (
                        <Tooltip content={acc.models.slice(4).join(', ')}>
                          <Tag size='small' className='text-11px font-mono bg-fill-3 cursor-pointer'>
                            +{acc.models.length - 4} more
                          </Tag>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Quota & limits row */}
                  <div className='p-6px 10px bg-fill-1 rd-6px mb-10px text-11px flex items-center justify-between'>
                    <div className='text-t-secondary'>
                      RPM: {acc.quotaLimit?.requestsPerMinute ?? 'Unlimited'} · TPM:{' '}
                      {acc.quotaLimit?.tokensPerMinute
                        ? `${Math.round(acc.quotaLimit.tokensPerMinute / 1000)}k`
                        : 'Unlimited'}
                    </div>
                    {acc.quotaRemaining?.requestsRemaining !== undefined && (
                      <div className='text-primary font-medium'>{acc.quotaRemaining.requestsRemaining} reqs left</div>
                    )}
                  </div>

                  <div className='flex items-center justify-between pt-8px border-t border-border-1 text-11px'>
                    <div className='text-t-secondary font-mono text-10px truncate max-w-160px'>{acc.id}</div>
                    <div className='flex items-center gap-6px'>
                      {isCooldown && (
                        <Button type='outline' status='warning' size='mini' onClick={() => handleResetCooldown(acc.id)}>
                          Reset Cooldown
                        </Button>
                      )}
                      <Button type='text' size='mini' icon={<Edit />} onClick={() => handleEdit(acc)}>
                        Edit
                      </Button>
                      <Popconfirm
                        title='Are you sure you want to remove this account?'
                        onOk={() => onDeleteAccount(acc.id)}
                      >
                        <Button type='text' status='danger' size='mini' icon={<Delete />}>
                          Delete
                        </Button>
                      </Popconfirm>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <AccountModal
        visible={modalVisible}
        account={editingAccount}
        initialPlatform={selectedPlatform}
        onClose={() => setModalVisible(false)}
        onSave={onSaveAccount}
      />
    </div>
  );
};
