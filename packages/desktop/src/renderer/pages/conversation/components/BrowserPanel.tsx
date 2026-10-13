import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, Spin, Tooltip } from '@arco-design/web-react';
import { Close, Left, Pause, Refresh, Right, SendOne } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { BROWSER_SESSION_PARTITION } from '@/common/config/constants';
import { useBrowser } from '../hooks/useBrowser';

export type BrowserPanelProps = {
  className?: string;
  initialUrl?: string;
  onClose?: () => void;
  visible?: boolean;
};

export const BrowserPanel: React.FC<BrowserPanelProps> = ({
  className = '',
  initialUrl = 'https://www.google.com',
  onClose,
  visible = true,
}) => {
  const { t } = useTranslation();
  const [inputUrl, setInputUrl] = useState<string>(initialUrl);

  const { canGoBack, canGoForward, failError, goBack, goForward, isLoading, navigate, reload, stop, url, webviewRef } =
    useBrowser({
      initialUrl,
      onNavigate: (newUrl) => {
        setInputUrl(newUrl);
      },
    });

  useEffect(() => {
    if (url) {
      setInputUrl(url);
    }
  }, [url]);

  const handleNavigate = useCallback(() => {
    const target = inputUrl.trim();
    if (target) {
      navigate(target);
    }
  }, [inputUrl, navigate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleNavigate();
      }
    },
    [handleNavigate]
  );

  // Improvement 3: keep webview mounted when hidden — use CSS display toggle
  // so session state, cookies, and scroll position survive panel toggle.
  return (
    <div
      className={`flex flex-col h-full w-full bg-[var(--color-bg-2)] border border-[var(--color-border-2)] rounded-lg overflow-hidden ${className}`}
      style={{ display: visible ? 'flex' : 'none' }}
    >
      {/* Browser toolbar */}
      <div className='flex items-center gap-2 p-2 bg-[var(--color-bg-1)] border-b border-[var(--color-border-2)]'>
        <Tooltip content={t('conversation.browser.back')}>
          <Button
            disabled={!canGoBack}
            icon={<Left theme='outline' size='14' />}
            onClick={goBack}
            shape='circle'
            size='small'
            type='secondary'
          />
        </Tooltip>

        <Tooltip content={t('conversation.browser.forward')}>
          <Button
            disabled={!canGoForward}
            icon={<Right theme='outline' size='14' />}
            onClick={goForward}
            shape='circle'
            size='small'
            type='secondary'
          />
        </Tooltip>

        {/* Improvement 4: Stop button while loading, Reload when idle */}
        {isLoading ? (
          <Tooltip content={t('conversation.browser.stop')}>
            <Button
              icon={<Pause theme='outline' size='14' />}
              onClick={stop}
              shape='circle'
              size='small'
              type='secondary'
            />
          </Tooltip>
        ) : (
          <Tooltip content={t('conversation.browser.refresh')}>
            <Button
              icon={<Refresh theme='outline' size='14' />}
              onClick={reload}
              shape='circle'
              size='small'
              type='secondary'
            />
          </Tooltip>
        )}

        {/* Address bar */}
        <div className='flex-1 flex items-center gap-1'>
          <Input
            onKeyDown={handleKeyDown}
            onChange={(val) => setInputUrl(val)}
            placeholder={t('conversation.browser.addressBarPlaceholder')}
            prefix={isLoading ? <Spin size={12} /> : null}
            size='small'
            value={inputUrl}
          />
          <Tooltip content={t('conversation.browser.navigate')}>
            <Button icon={<SendOne theme='outline' size='14' />} onClick={handleNavigate} size='small' type='primary' />
          </Tooltip>
        </div>

        {onClose && (
          <Tooltip content={t('conversation.browser.close')}>
            <Button
              icon={<Close theme='outline' size='14' />}
              onClick={onClose}
              shape='circle'
              size='small'
              type='text'
            />
          </Tooltip>
        )}
      </div>

      {/* Improvement 5: in-panel error banner */}
      {failError && (
        <div className='flex items-center gap-2 px-3 py-2 bg-[var(--color-danger-light-1)] border-b border-[var(--color-danger-light-3)] text-[var(--color-danger-6)] text-sm'>
          <span className='flex-1'>{failError}</span>
          <Button onClick={reload} size='mini' type='outline' status='danger'>
            {t('conversation.browser.retry')}
          </Button>
        </div>
      )}

      {/* Webview container — uses shared BROWSER_SESSION_PARTITION for persistent sessions */}
      <div className='flex-1 relative w-full h-full bg-[var(--color-bg-1)]'>
        <webview
          {...({ allowpopups: 'true' } as object)}
          className='w-full h-full border-none block'
          partition={BROWSER_SESSION_PARTITION}
          ref={webviewRef}
          src={url}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
};

export default BrowserPanel;
