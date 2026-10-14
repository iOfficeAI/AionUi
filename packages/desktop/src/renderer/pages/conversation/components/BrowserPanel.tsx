import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, Message, Popconfirm, Select, Spin, Tag, Tooltip } from '@arco-design/web-react';
import {
  BrowserChrome,
  Caution,
  Clear,
  Close,
  HandDown,
  Left,
  ListOne,
  Pause,
  Refresh,
  Right,
  SendOne,
} from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useBrowser } from '../hooks/useBrowser';
import { useBrowserProfiles } from '../hooks/useBrowserProfiles';
import { SafetyApprovalModal } from './browser/SafetyApprovalModal';
import { ActionLogDrawer } from './browser/ActionLogDrawer';

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
  const [chromeStatus, setChromeStatus] = useState<string | null>(null);
  const [isActionLogVisible, setIsActionLogVisible] = useState(false);
  const [isManualTakeover, setIsManualTakeover] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!window.electronAPI?.onBrowserToolProgress) return;
    const unsub = window.electronAPI.onBrowserToolProgress((event: unknown) => {
      const prog = event as { taskId?: string; phase?: string };
      if (prog.phase === 'started' || prog.phase === 'progress') {
        setActiveTaskId(prog.taskId || null);
      } else {
        setActiveTaskId(null);
      }
    });
    return () => {
      unsub();
    };
  }, []);

  const handleHaltActiveAutomation = useCallback(() => {
    if (activeTaskId && window.electronAPI?.browserCancelToolTask) {
      void window.electronAPI.browserCancelToolTask(activeTaskId);
      Message.warning('Halted browser automation task');
      setActiveTaskId(null);
    }
  }, [activeTaskId]);

  const { activeProfile, clearProfileData, launchExternalChrome, probeExternalChrome, profiles, switchProfile } =
    useBrowserProfiles();

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

  const handleClearData = useCallback(async () => {
    const success = await clearProfileData(activeProfile.id);
    if (success) {
      Message.success(t('conversation.browser.clearDataSuccess'));
      reload();
    } else {
      Message.error('Failed to clear profile data');
    }
  }, [activeProfile.id, clearProfileData, reload, t]);

  const handleLaunchChrome = useCallback(async () => {
    if (!activeProfile.externalChrome) return;
    setChromeStatus('Connecting...');
    const status = await launchExternalChrome(activeProfile.externalChrome);
    if (status.running) {
      setChromeStatus(t('conversation.browser.chromeConnected'));
      Message.success(`${t('conversation.browser.chromeConnected')} (Port ${status.port})`);
    } else {
      setChromeStatus(status.error || 'Failed to start');
      Message.error(status.error || 'Failed to launch Google Chrome');
    }
  }, [activeProfile.externalChrome, launchExternalChrome, t]);

  useEffect(() => {
    if (activeProfile.backend === 'external-chrome') {
      const port = activeProfile.externalChrome?.port || 9222;
      void probeExternalChrome(port).then((st) => {
        if (st.running) {
          setChromeStatus(t('conversation.browser.chromeConnected'));
        } else {
          setChromeStatus(null);
        }
      });
    }
  }, [activeProfile, probeExternalChrome, t]);

  return (
    <div
      className={`flex flex-col h-full w-full bg-[var(--color-bg-2)] border border-[var(--color-border-2)] rounded-lg overflow-hidden ${className}`}
      style={{ display: visible ? 'flex' : 'none' }}
    >
      {/* Browser toolbar */}
      <div className='flex items-center gap-2 p-2 bg-[var(--color-bg-1)] border-b border-[var(--color-border-2)] flex-wrap'>
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

        {/* Profile Selector */}
        <Select className='w-140px' size='small' value={activeProfile.id} onChange={(val) => void switchProfile(val)}>
          {profiles.map((p) => (
            <Select.Option key={p.id} value={p.id}>
              {p.name}
            </Select.Option>
          ))}
        </Select>

        {/* Backend Tag */}
        {activeProfile.backend === 'external-chrome' ? (
          <Tag color='arcoblue' size='small'>
            {t('conversation.browser.backendChrome')}
          </Tag>
        ) : (
          <Tag color='gray' size='small'>
            {t('conversation.browser.backendEmbedded')}
          </Tag>
        )}

        {/* Clear Data Button */}
        <Popconfirm focusLock title={t('conversation.browser.clearDataConfirm')} onOk={handleClearData}>
          <Tooltip content={t('conversation.browser.clearData')}>
            <Button icon={<Clear theme='outline' size='14' />} shape='circle' size='small' type='secondary' />
          </Tooltip>
        </Popconfirm>

        {/* Address bar */}
        <div className='flex-1 flex items-center gap-1 min-w-160px'>
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

        {/* Action Log Drawer Toggle */}
        <Tooltip content='Action Log'>
          <Button
            icon={<ListOne theme='outline' size='14' />}
            onClick={() => setIsActionLogVisible(true)}
            size='small'
            type='secondary'
          />
        </Tooltip>

        {/* Take over manually mode */}
        <Tooltip content={isManualTakeover ? 'Release manual takeover' : 'Take over manually (pause agent)'}>
          <Button
            icon={<HandDown theme='outline' size='14' />}
            onClick={() => setIsManualTakeover((prev) => !prev)}
            size='small'
            status={isManualTakeover ? 'warning' : 'default'}
            type={isManualTakeover ? 'primary' : 'secondary'}
          >
            {isManualTakeover ? 'Manual Mode' : 'Take Over'}
          </Button>
        </Tooltip>

        {/* Prominent Stop Automation Button */}
        {activeTaskId && (
          <Button
            icon={<Pause theme='outline' size='14' />}
            onClick={handleHaltActiveAutomation}
            size='small'
            status='danger'
            type='primary'
          >
            STOP Automation
          </Button>
        )}

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

      {/* Manual takeover indicator banner */}
      {isManualTakeover && (
        <div className='flex items-center gap-2 px-3 py-1.5 bg-[var(--color-warning-light-1)] border-b border-[var(--color-warning-light-3)] text-[var(--color-warning-6)] text-xs'>
          <Caution theme='filled' size='14' fill='#FF7D00' />
          <span className='flex-1 font-medium'>
            Manual Takeover Active — Automated agent interactions paused. Click &quot;Release&quot; to allow automation
            to resume.
          </span>
          <Button size='mini' type='primary' status='warning' onClick={() => setIsManualTakeover(false)}>
            Release
          </Button>
        </div>
      )}

      {/* External Chrome banner when active */}
      {activeProfile.backend === 'external-chrome' && (
        <div className='flex items-center gap-2 px-3 py-1.5 bg-[var(--color-primary-light-1)] border-b border-[var(--color-primary-light-3)] text-[var(--color-primary-6)] text-xs'>
          <BrowserChrome theme='outline' size='14' />
          <span className='flex-1'>
            {t('conversation.browser.backendChrome')} (Port {activeProfile.externalChrome?.port || 9222}) —{' '}
            {chromeStatus || 'Ready to connect'}
          </span>
          <Button size='mini' type='primary' onClick={handleLaunchChrome}>
            {t('conversation.browser.launchChrome')}
          </Button>
        </div>
      )}

      {/* Load error banner */}
      {failError && (
        <div className='flex items-center gap-2 px-3 py-2 bg-[var(--color-danger-light-1)] border-b border-[var(--color-danger-light-3)] text-[var(--color-danger-6)] text-sm'>
          <span className='flex-1'>{failError}</span>
          <Button onClick={reload} size='mini' type='outline' status='danger'>
            {t('conversation.browser.retry')}
          </Button>
        </div>
      )}

      {/* Webview container with dynamic persistent session partition */}
      <div className='flex-1 relative w-full h-full bg-[var(--color-bg-1)]'>
        <webview
          {...({ allowpopups: 'true' } as object)}
          className='w-full h-full border-none block'
          key={activeProfile.partition}
          partition={activeProfile.partition}
          ref={webviewRef}
          src={url}
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      <SafetyApprovalModal />
      <ActionLogDrawer
        visible={isActionLogVisible}
        onClose={() => setIsActionLogVisible(false)}
        onCancelActiveTask={handleHaltActiveAutomation}
      />
    </div>
  );
};

export default BrowserPanel;
