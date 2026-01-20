/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { Collapse, Switch, Input, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { CliSettingsPanelProps } from './types';

// CLI Logo 导入 / CLI Logo imports
import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import GooseLogo from '@/renderer/assets/logos/goose.svg';
import AuggieLogo from '@/renderer/assets/logos/auggie.svg';
import KimiLogo from '@/renderer/assets/logos/kimi.svg';
import OpencodeLogo from '@/renderer/assets/logos/opencode.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';

/**
 * 后端 Logo 映射表
 * Backend logo mapping
 */
const BACKEND_LOGO_MAP: Record<string, string> = {
  claude: ClaudeLogo,
  goose: GooseLogo,
  auggie: AuggieLogo,
  kimi: KimiLogo,
  opencode: OpencodeLogo,
  codex: CodexLogo,
};

/**
 * 单个 CLI 设置面板组件
 * Single CLI Settings Panel Component
 */
const CliSettingsPanel: React.FC<CliSettingsPanelProps> = ({ backend, name, cliPath, config, onConfigChange }) => {
  const { t } = useTranslation();
  const logo = BACKEND_LOGO_MAP[backend];

  const handleYoloToggle = useCallback(
    (checked: boolean) => {
      onConfigChange({ ...config, yoloMode: checked });
    },
    [config, onConfigChange]
  );

  const handleEnabledToggle = useCallback(
    (checked: boolean) => {
      onConfigChange({ ...config, enabled: checked });
    },
    [config, onConfigChange]
  );

  const handleArgsChange = useCallback(
    (value: string) => {
      const args = value.split(' ').filter(Boolean);
      onConfigChange({ ...config, customArgs: args });
    },
    [config, onConfigChange]
  );

  return (
    <Collapse.Item
      className='[&_div.arco-collapse-item-header-title]:flex-1'
      header={
        <div className='flex items-center justify-between w-full'>
          <div className='flex items-center gap-8px'>
            {logo && <img src={logo} alt={`${name} logo`} className='w-24px h-24px object-contain' />}
            <span className='font-medium'>{name}</span>
            {cliPath && <Typography.Text type='secondary' className='text-xs ml-8px'>{cliPath}</Typography.Text>}
          </div>
          <Switch
            size='small'
            checked={config.enabled}
            onChange={(checked) => {
              // 阻止事件冒泡到 Collapse.Item
              // Prevent event bubbling to Collapse.Item
              handleEnabledToggle(checked);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      }
      name={backend}
    >
      <div className='space-y-16px py-8px'>
        {/* YOLO Mode Toggle */}
        <div className='flex items-center justify-between'>
          <div>
            <div className='font-medium text-t-primary'>{t('settings.cliYoloMode')}</div>
            <div className='text-xs text-t-secondary'>{t('settings.cliYoloModeDesc')}</div>
          </div>
          <Switch checked={config.yoloMode} onChange={handleYoloToggle} />
        </div>

        {/* Custom Arguments */}
        <div>
          <div className='font-medium text-t-primary mb-8px'>{t('settings.cliCustomArgs')}</div>
          <Input
            placeholder={t('settings.cliCustomArgsPlaceholder')}
            value={config.customArgs?.join(' ') || ''}
            onChange={handleArgsChange}
          />
          <div className='text-xs text-t-secondary mt-4px'>{t('settings.cliCustomArgsDesc')}</div>
        </div>

        {/* CLI Path (Read-only) */}
        <div>
          <div className='font-medium text-t-primary mb-8px'>{t('settings.cliPath')}</div>
          <Input value={config.cliPath || cliPath} disabled />
        </div>
      </div>
    </Collapse.Item>
  );
};

export default CliSettingsPanel;
