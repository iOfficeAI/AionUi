/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Button, Message, Modal } from '@arco-design/web-react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PreferenceRow from './PreferenceRow';

/**
 * 应用内浏览器设置 / In-app browser settings.
 *
 * 目前只有"清空浏览数据"一项，但值得单独成节：登录态是全局共享的（所有 tab、
 * 所有项目共用），用户需要一个明确的地方知道"我的登录信息存在哪、怎么清掉"。
 * 藏在开发者设置里会让人以为这是调试功能。
 *
 * Only one action today, but it deserves its own section: sign-in state is global
 * (shared across every tab and project), so the user needs an obvious place to
 * learn where those credentials live and how to remove them. Hiding it under
 * developer settings would read as a debugging feature.
 */
const BrowserDataSection: React.FC = () => {
  const { t } = useTranslation();
  const [clearing, setClearing] = useState(false);

  const handleClear = useCallback(() => {
    // 二次确认：清掉之后所有网站都要重新登录，且不可撤销
    // Confirm first: this signs out of every site and cannot be undone.
    Modal.confirm({
      title: t('settings.browserData.clearConfirmTitle'),
      content: t('settings.browserData.clearConfirmContent'),
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        setClearing(true);
        try {
          const result = await ipcBridge.application.clearBrowserData.invoke();
          if (result.success) {
            Message.success(t('settings.browserData.clearSuccess'));
          } else {
            Message.error(result.msg || t('settings.browserData.clearFailed'));
          }
        } catch {
          Message.error(t('settings.browserData.clearFailed'));
        } finally {
          setClearing(false);
        }
      },
    });
  }, [t]);

  return (
    <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px'>
      <div className='text-14px font-medium text-t-primary mb-8px'>{t('settings.browserData.title')}</div>
      <PreferenceRow label={t('settings.browserData.clearLabel')} description={t('settings.browserData.clearDesc')}>
        <Button size='small' status='danger' loading={clearing} onClick={handleClear}>
          {t('common.clear')}
        </Button>
      </PreferenceRow>
    </div>
  );
};

export default BrowserDataSection;
