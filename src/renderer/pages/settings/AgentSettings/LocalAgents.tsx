/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ipcBridge } from '@/common';
import { Avatar, Button, Link, Tooltip, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Setting } from '@icon-park/react';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import useSWR from 'swr';

const LocalAgents: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 动态获取用户本地已安装的 Agent 列表
  const { data: detectedAgents } = useSWR('acp.agents.available.settings', async () => {
    const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (result.success) {
      // 过滤掉 custom 和 remote 类型，只保留本地 Agent
      return result.data.filter((agent) => agent.backend !== 'custom' && agent.backend !== 'remote');
    }
    return [];
  });

  // Gemini CLI 始终显示在第一位
  const geminiAgent = detectedAgents?.find((a) => a.backend === 'gemini');
  const otherAgents = detectedAgents?.filter((a) => a.backend !== 'gemini') ?? [];

  return (
    <div className='flex flex-col gap-8px py-16px'>
      <span className='text-12px px-16px text-t-secondary'>
        {t('settings.agentManagement.localAgentsDescription')}
        {'  '}
        <Link href='https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup' target='_blank' className='text-12px'>
          {t('settings.agentManagement.localAgentsSetupLink')}
        </Link>
      </span>

      {/* Gemini CLI — 设置按钮可点击 */}
      {geminiAgent && (
        <div className='flex items-center justify-between px-16px py-10px rd-8px bg-aou-1 hover:bg-aou-2'>
          <div className='flex items-center gap-12px min-w-0 flex-1'>
            <Avatar size={32} shape='square' style={{ flexShrink: 0, backgroundColor: 'transparent' }}>
              {getAgentLogo('gemini') ? (
                <img src={getAgentLogo('gemini')!} alt='Gemini CLI' className='w-full h-full object-contain' />
              ) : (
                '🤖'
              )}
            </Avatar>
            <Typography.Text className='font-medium text-14px'>Gemini CLI</Typography.Text>
          </div>
          <Button
            size='small'
            type='text'
            icon={<Setting theme='outline' size='14' />}
            onClick={() => navigate('/settings/gemini')}
          />
        </div>
      )}

      {/* 其他本地 Agents — 设置按钮禁用 */}
      {otherAgents.map((agent) => {
        const logo = getAgentLogo(agent.backend);

        return (
          <div
            key={agent.backend}
            className='flex items-center justify-between px-16px py-10px rd-8px bg-aou-1 hover:bg-aou-2'
          >
            <div className='flex items-center gap-12px min-w-0 flex-1'>
              <Avatar size={32} shape='square' style={{ flexShrink: 0, backgroundColor: 'transparent' }}>
                {logo ? <img src={logo} alt={agent.name} className='w-full h-full object-contain' /> : '🤖'}
              </Avatar>
              <Typography.Text className='font-medium text-14px'>{agent.name}</Typography.Text>
            </div>
            <Tooltip content={t('settings.agentManagement.settingsDisabledHint')}>
              <Button
                size='small'
                type='text'
                icon={<Setting theme='outline' size='14' />}
                disabled
                style={{ color: 'var(--color-text-4)' }}
              />
            </Tooltip>
          </div>
        );
      })}

      {/* 空状态 */}
      {(!detectedAgents || detectedAgents.length === 0) && (
        <Typography.Text type='secondary' className='block py-32px text-center'>
          {t('settings.agentManagement.localAgentsEmpty')}
        </Typography.Text>
      )}
    </div>
  );
};

export default LocalAgents;
