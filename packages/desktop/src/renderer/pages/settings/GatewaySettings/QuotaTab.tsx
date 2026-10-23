/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Button, Card, Message, Progress, Tag } from '@arco-design/web-react';
import { Dashboard, Refresh, Time } from '@icon-park/react';
import type { GatewayAccount } from './types';

type QuotaTabProps = {
  accounts: GatewayAccount[];
  onRefresh: () => void;
};

export const QuotaTab: React.FC<QuotaTabProps> = ({ accounts, onRefresh }) => {
  const [, setTick] = useState(0);

  // Update countdown every second for active cooldowns
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleResetCooldown = async (accId: string) => {
    if (window.electronAPI?.gatewayResetCooldown) {
      await window.electronAPI.gatewayResetCooldown(accId);
      Message.success('Rate limit cooldown reset');
      onRefresh();
    }
  };

  return (
    <div className='flex flex-col gap-16px'>
      <div className='flex items-center justify-between'>
        <div>
          <div className='text-16px font-600 text-t-primary'>Provider Quotas & Rate Limits</div>
          <div className='text-12px text-t-secondary'>
            Track live rate-limit budgets (RPM / TPM), response header counters, and cooldown states across all
            accounts.
          </div>
        </div>
        <Button type='secondary' size='small' icon={<Refresh />} onClick={onRefresh}>
          Refresh Quotas
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card className='text-center py-40px bg-fill-1 rd-12px border border-border-1'>
          <div className='text-14px font-medium text-t-primary mb-4px'>No connected accounts</div>
          <div className='text-12px text-t-secondary'>
            Connect accounts in the Accounts tab to monitor live quotas and rate limits.
          </div>
        </Card>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 gap-16px'>
          {accounts.map((acc) => {
            const isCooldown = Boolean(acc.cooldownUntil && acc.cooldownUntil > Date.now());
            const remainingSec = isCooldown
              ? Math.max(0, Math.round(((acc.cooldownUntil ?? 0) - Date.now()) / 1000))
              : 0;

            const reqRemaining = acc.quotaRemaining?.requestsRemaining;
            const reqLimit = acc.quotaLimit?.requestsPerMinute;
            const reqPercent =
              reqLimit && reqRemaining !== undefined
                ? Math.min(100, Math.max(0, Math.round((reqRemaining / reqLimit) * 100)))
                : reqRemaining !== undefined
                  ? 100
                  : undefined;

            return (
              <Card key={acc.id} className='rd-12px border border-border-1' bodyStyle={{ padding: '16px' }}>
                <div className='flex items-center justify-between mb-12px'>
                  <div className='flex items-center gap-8px'>
                    <Dashboard theme='outline' size='18' className='text-primary-6' />
                    <span className='font-600 text-15px text-t-primary'>{acc.name}</span>
                    <Tag size='small' color='arcoblue'>
                      {acc.platform.toUpperCase()}
                    </Tag>
                  </div>
                  {isCooldown ? (
                    <Tag color='gold' size='small' icon={<Time />}>
                      Cooldown: {remainingSec}s
                    </Tag>
                  ) : acc.enabled ? (
                    <Tag color='green' size='small'>
                      Available
                    </Tag>
                  ) : (
                    <Tag color='gray' size='small'>
                      Disabled
                    </Tag>
                  )}
                </div>

                {/* Quota meters */}
                <div className='flex flex-col gap-12px my-14px'>
                  {/* Requests Capacity */}
                  <div>
                    <div className='flex items-center justify-between text-12px mb-4px'>
                      <span className='text-t-secondary font-medium'>Requests Remaining</span>
                      <span className='font-mono font-semibold text-t-primary'>
                        {reqRemaining !== undefined ? `${reqRemaining} left` : 'Unmetered'}
                        {reqLimit ? ` / ${reqLimit} RPM` : ''}
                      </span>
                    </div>
                    {reqPercent !== undefined && (
                      <Progress
                        percent={reqPercent}
                        status={reqPercent < 20 ? 'error' : reqPercent < 50 ? 'warning' : 'normal'}
                        size='small'
                        showText={false}
                      />
                    )}
                  </div>

                  {/* Tokens Capacity */}
                  <div>
                    <div className='flex items-center justify-between text-12px mb-4px'>
                      <span className='text-t-secondary font-medium'>Tokens Remaining</span>
                      <span className='font-mono font-semibold text-t-primary'>
                        {acc.quotaRemaining?.tokensRemaining !== undefined
                          ? `${acc.quotaRemaining.tokensRemaining.toLocaleString()} left`
                          : 'Unmetered'}
                        {acc.quotaLimit?.tokensPerMinute
                          ? ` / ${(acc.quotaLimit.tokensPerMinute / 1000).toFixed(0)}k TPM`
                          : ''}
                      </span>
                    </div>
                    {acc.quotaLimit?.tokensPerMinute && acc.quotaRemaining?.tokensRemaining !== undefined && (
                      <Progress
                        percent={Math.min(
                          100,
                          Math.max(
                            0,
                            Math.round((acc.quotaRemaining.tokensRemaining / acc.quotaLimit.tokensPerMinute) * 100)
                          )
                        )}
                        size='small'
                        showText={false}
                      />
                    )}
                  </div>
                </div>

                <div className='flex items-center justify-between pt-10px border-t border-border-1 text-12px'>
                  <span className='text-t-secondary text-11px'>
                    {acc.quotaRemaining?.lastUpdated
                      ? `Updated: ${new Date(acc.quotaRemaining.lastUpdated).toLocaleTimeString()}`
                      : 'No requests yet'}
                  </span>
                  {isCooldown && (
                    <Button type='outline' status='warning' size='mini' onClick={() => handleResetCooldown(acc.id)}>
                      Clear Cooldown
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
