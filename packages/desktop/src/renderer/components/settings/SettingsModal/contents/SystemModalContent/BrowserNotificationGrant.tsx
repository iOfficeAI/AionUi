/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * WebUI-only control to request browser notification permission. In Electron
 * this is never rendered (native notifications are used instead). Renders a
 * grant button, the granted/denied state, or a hint when the page is not a
 * secure context (HTTPS / localhost), where the Notification API is unavailable.
 */
const BrowserNotificationGrant: React.FC = () => {
  const { t } = useTranslation();
  const supported = typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext;
  const [permission, setPermission] = useState<NotificationPermission>(supported ? Notification.permission : 'denied');

  const handleRequest = useCallback(() => {
    if (!supported) return;
    void Notification.requestPermission().then((result) => setPermission(result));
  }, [supported]);

  if (!supported) {
    return <div className='pl-12px text-12px text-3'>{t('settings.browserNotification.insecureContext')}</div>;
  }
  if (permission === 'granted') {
    return <div className='pl-12px text-12px text-3'>{t('settings.browserNotification.granted')}</div>;
  }
  if (permission === 'denied') {
    return <div className='pl-12px text-12px text-3'>{t('settings.browserNotification.denied')}</div>;
  }
  return (
    <div className='pl-12px'>
      <Button type='outline' size='small' onClick={handleRequest}>
        {t('settings.browserNotification.enable')}
      </Button>
    </div>
  );
};

export default BrowserNotificationGrant;
