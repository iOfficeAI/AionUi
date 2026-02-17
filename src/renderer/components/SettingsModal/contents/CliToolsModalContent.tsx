/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { iconColors } from '@/renderer/theme/colors';
import { Button, Message, Modal, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { CheckOne, CloseOne, Copy, DownloadOne, LinkCloud, Log, Refresh, UpdateRotation } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsViewMode } from '../settingsViewContext';

interface CliToolInfo {
  backend: string;
  name: string;
  installed?: boolean;
  version?: string;
  cliCommand?: string;
  installCommand?: string;
  installUrl?: string;
  statusChecked?: boolean;
}

interface UtilityToolInfo {
  id: string;
  name: string;
  description: string;
  cliCommand: string;
  installed?: boolean;
  version?: string;
  loggedIn?: boolean;
  loginUser?: string;
  installCommand?: string;
  updateCommand?: string;
  loginCommand?: string;
  installUrl?: string;
  hasSkill?: boolean;
  skillInstalled?: boolean;
  /** Directory path where this tool's definition lives */
  toolDir?: string;
  statusChecked?: boolean;
}

/**
 * CLI Tools section component for embedding within the Tools settings page.
 * Shows installation status and version info for all supported CLI agent tools.
 * Provides install commands, one-click install, and links for tools that are not yet installed.
 *
 * Uses progressive loading: the tool list renders immediately from registry data,
 * then each tool's CLI status (installed/version) is checked independently.
 */
export const CliToolsSection: React.FC<{ isPageMode?: boolean }> = ({ isPageMode }) => {
  const { t } = useTranslation();
  const [cliTools, setCliTools] = useState<CliToolInfo[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [checkingBackends, setCheckingBackends] = useState<Set<string>>(new Set());
  const [installingBackend, setInstallingBackend] = useState<string | null>(null);
  const [settingUpBackend, setSettingUpBackend] = useState<string | null>(null);
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });
  const [modal, modalContext] = Modal.useModal();
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const checkSingleToolStatus = useCallback(async (backend: string) => {
    setCheckingBackends((prev) => new Set(prev).add(backend));
    try {
      const result = await ipcBridge.acpConversation.checkCliToolStatus.invoke({ backend: backend as any });
      if (!mountedRef.current) return;
      if (result.success && result.data) {
        setCliTools((prev) => prev.map((tool) => (tool.backend === backend ? { ...tool, installed: result.data!.installed, version: result.data!.version, statusChecked: true } : tool)));
      } else {
        setCliTools((prev) => prev.map((tool) => (tool.backend === backend ? { ...tool, statusChecked: true } : tool)));
      }
    } catch {
      if (!mountedRef.current) return;
      setCliTools((prev) => prev.map((tool) => (tool.backend === backend ? { ...tool, statusChecked: true } : tool)));
    } finally {
      if (mountedRef.current) {
        setCheckingBackends((prev) => {
          const next = new Set(prev);
          next.delete(backend);
          return next;
        });
      }
    }
  }, []);

  const fetchToolsAndCheckStatus = useCallback(async () => {
    setListLoading(true);
    try {
      const result = await ipcBridge.acpConversation.getCliToolsList.invoke();
      if (!mountedRef.current) return;
      if (result.success && result.data) {
        const tools: CliToolInfo[] = result.data.map((tool) => ({
          ...tool,
          installed: undefined as boolean | undefined,
          version: undefined as string | undefined,
          statusChecked: false,
        }));
        setCliTools(tools);
        setListLoading(false);

        // Fire off individual status checks - each resolves independently
        for (const tool of tools) {
          void checkSingleToolStatus(tool.backend);
        }
      }
    } catch (error) {
      console.error('Failed to fetch CLI tools list:', error);
    } finally {
      if (mountedRef.current) {
        setListLoading(false);
      }
    }
  }, [checkSingleToolStatus]);

  useEffect(() => {
    void fetchToolsAndCheckStatus();
  }, [fetchToolsAndCheckStatus]);

  const handleCopyCommand = useCallback(
    (command: string) => {
      void navigator.clipboard.writeText(command).then(() => {
        message.success(t('settings.cliTools.copied', { defaultValue: 'Copied to clipboard' }));
      });
    },
    [message, t]
  );

  const handleOpenUrl = useCallback((url: string) => {
    void ipcBridge.shell.openExternal.invoke(url);
  }, []);

  const handleInstall = useCallback(
    (tool: CliToolInfo) => {
      if (!tool.installCommand) return;

      modal.confirm({
        title: t('settings.cliTools.installConfirmTitle', { defaultValue: 'Install {{name}}', name: tool.name }),
        content: (
          <div className='space-y-8px'>
            <div className='text-14px text-t-secondary'>{t('settings.cliTools.installConfirmDesc', { defaultValue: 'This will run the following command on your system:' })}</div>
            <div className='bg-fill-2 rd-8px px-12px py-8px font-mono text-13px text-t-primary break-all'>{tool.installCommand}</div>
          </div>
        ),
        okText: t('settings.cliTools.installBtn', { defaultValue: 'Install' }),
        cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
        onOk: async () => {
          setInstallingBackend(tool.backend);
          try {
            const result = await ipcBridge.acpConversation.installCli.invoke({ backend: tool.backend as any });
            if (result.success) {
              message.success(t('settings.cliTools.installSuccess', { defaultValue: '{{name}} installed successfully!', name: tool.name }));
              // Re-check just this tool's status after install
              await checkSingleToolStatus(tool.backend);
            } else {
              message.error(result.msg || t('settings.cliTools.installFailed', { defaultValue: 'Installation failed' }));
            }
          } catch (error) {
            message.error(t('settings.cliTools.installFailed', { defaultValue: 'Installation failed' }));
          } finally {
            setInstallingBackend(null);
          }
        },
      });
    },
    [modal, message, t, checkSingleToolStatus]
  );

  const handleSetup = useCallback(
    async (tool: CliToolInfo) => {
      setSettingUpBackend(tool.backend);
      try {
        const result = await ipcBridge.acpConversation.setupCli.invoke({ backend: tool.backend as any });
        if (result.success) {
          const output = result.data?.output || '';
          message.success(
            t('settings.cliTools.setupSuccess', {
              defaultValue: '{{name}} is working correctly',
              name: tool.name,
            }) + (output ? `: ${output.slice(0, 100)}` : '')
          );
        } else {
          message.warning(result.msg || t('settings.cliTools.setupFailed', { defaultValue: 'Setup verification failed' }));
        }
      } catch {
        message.error(t('settings.cliTools.setupFailed', { defaultValue: 'Setup verification failed' }));
      } finally {
        setSettingUpBackend(null);
      }
    },
    [message, t]
  );

  const isRefreshing = checkingBackends.size > 0;
  const installedCount = cliTools.filter((tool) => tool.statusChecked && tool.installed === true).length;

  return (
    <div className='flex flex-col gap-16px min-h-0'>
      {messageContext}
      {modalContext}

      {/* Header with title and refresh */}
      <div className='flex gap-8px items-center justify-between'>
        <div className='text-14px text-t-primary'>{t('settings.cliTools.title', { defaultValue: 'CLI Tools' })}</div>
        <Tooltip content={t('settings.cliTools.refresh', { defaultValue: 'Refresh' })}>
          <Button type='text' size='small' icon={<Refresh theme='outline' size='16' fill={iconColors.secondary} />} loading={isRefreshing} onClick={() => void fetchToolsAndCheckStatus()} />
        </Tooltip>
      </div>

      <div className='text-12px text-t-secondary'>{t('settings.cliTools.description', { defaultValue: 'Manage CLI agent tools installed on your system. These tools power the AI agents available in AionUi.' })}</div>

      {listLoading ? (
        <div className='py-24px flex justify-center'>
          <Spin size={24} />
        </div>
      ) : (
        <div className='space-y-16px'>
          <div className='w-full flex flex-col divide-y divide-border-2'>
            {cliTools.map((tool) => {
              const isPending = !tool.statusChecked;

              return (
                <div key={tool.backend} className='flex items-center justify-between py-12px gap-16px'>
                  <div className='flex items-center gap-12px min-w-0 flex-1'>
                    {isPending ? <Spin size={18} className='flex-shrink-0' /> : tool.installed ? <CheckOne theme='filled' size='18' fill='rgb(var(--green-6))' className='flex-shrink-0' /> : <CloseOne theme='filled' size='18' fill='rgb(var(--gray-5))' className='flex-shrink-0' />}
                    <div className='min-w-0'>
                      <div className='text-14px text-t-primary font-medium'>{tool.name}</div>
                      {tool.cliCommand && <div className='text-12px text-t-secondary font-mono'>{tool.cliCommand}</div>}
                    </div>
                  </div>
                  <div className='flex items-center gap-8px flex-shrink-0'>
                    {tool.statusChecked && tool.installed && (
                      <>
                        {tool.version && (
                          <Tag size='small' color='arcoblue'>
                            {tool.version}
                          </Tag>
                        )}
                        <Tooltip content={t('settings.cliTools.verifySetup', { defaultValue: 'Verify setup' })}>
                          <Button type='text' size='mini' loading={settingUpBackend === tool.backend} icon={<CheckOne theme='outline' size='14' fill={iconColors.secondary} />} onClick={() => void handleSetup(tool)} />
                        </Tooltip>
                        {tool.installUrl && (
                          <Tooltip content={t('settings.cliTools.viewDocs', { defaultValue: 'View documentation' })}>
                            <Button type='text' size='mini' icon={<LinkCloud theme='outline' size='14' fill={iconColors.secondary} />} onClick={() => handleOpenUrl(tool.installUrl!)} />
                          </Tooltip>
                        )}
                      </>
                    )}
                    {tool.statusChecked && !tool.installed && (
                      <>
                        {tool.installCommand && (
                          <>
                            <Tooltip content={t('settings.cliTools.installTooltip', { defaultValue: 'Install {{name}} on your system', name: tool.name })}>
                              <Button type='primary' size='mini' loading={installingBackend === tool.backend} icon={<DownloadOne theme='outline' size='14' />} onClick={() => handleInstall(tool)}>
                                {t('settings.cliTools.installBtn', { defaultValue: 'Install' })}
                              </Button>
                            </Tooltip>
                            <Tooltip content={tool.installCommand}>
                              <Button type='text' size='mini' icon={<Copy theme='outline' size='14' fill={iconColors.secondary} />} onClick={() => handleCopyCommand(tool.installCommand!)} />
                            </Tooltip>
                          </>
                        )}
                        {tool.installUrl && (
                          <Tooltip content={t('settings.cliTools.installGuide', { defaultValue: 'Installation guide' })}>
                            <Button type='text' size='mini' icon={<LinkCloud theme='outline' size='14' fill={iconColors.secondary} />} onClick={() => handleOpenUrl(tool.installUrl!)} />
                          </Tooltip>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {cliTools.length > 0 && (
            <div className='text-12px text-t-secondary'>
              {t('settings.cliTools.summary', {
                defaultValue: '{{installed}} of {{total}} CLI tools installed',
                installed: installedCount,
                total: cliTools.length,
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Utility CLI Tools section component.
 * Shows installation status, version, login status for utility CLI tools like gh.
 * Provides install, update, login, and skill installation actions.
 *
 * Uses progressive loading: the tool list renders immediately from registry data,
 * then each tool's CLI status is checked independently.
 */
export const UtilityToolsSection: React.FC<{ isPageMode?: boolean }> = ({ isPageMode: _isPageMode }) => {
  const { t } = useTranslation();
  const [tools, setTools] = useState<UtilityToolInfo[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [checkingTools, setCheckingTools] = useState<Set<string>>(new Set());
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [message, messageContext] = Message.useMessage({ maxCount: 5 });
  const [modal, modalContext] = Modal.useModal();
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const checkSingleToolStatus = useCallback(async (toolId: string) => {
    setCheckingTools((prev) => new Set(prev).add(toolId));
    try {
      const result = await ipcBridge.utilityTools.checkToolStatus.invoke({ toolId });
      if (!mountedRef.current) return;
      if (result.success && result.data) {
        setTools((prev) =>
          prev.map((tool) =>
            tool.id === toolId
              ? {
                  ...tool,
                  installed: result.data!.installed,
                  version: result.data!.version,
                  loggedIn: result.data!.loggedIn,
                  loginUser: result.data!.loginUser,
                  skillInstalled: result.data!.skillInstalled,
                  statusChecked: true,
                }
              : tool
          )
        );
      } else {
        setTools((prev) => prev.map((tool) => (tool.id === toolId ? { ...tool, statusChecked: true } : tool)));
      }
    } catch {
      if (!mountedRef.current) return;
      setTools((prev) => prev.map((tool) => (tool.id === toolId ? { ...tool, statusChecked: true } : tool)));
    } finally {
      if (mountedRef.current) {
        setCheckingTools((prev) => {
          const next = new Set(prev);
          next.delete(toolId);
          return next;
        });
      }
    }
  }, []);

  const fetchToolsAndCheckStatus = useCallback(async () => {
    setListLoading(true);
    try {
      const result = await ipcBridge.utilityTools.getToolsList.invoke();
      if (!mountedRef.current) return;
      if (result.success && result.data) {
        const toolsList: UtilityToolInfo[] = result.data.map((tool) => ({
          ...tool,
          installed: undefined as boolean | undefined,
          version: undefined as string | undefined,
          loggedIn: undefined as boolean | undefined,
          loginUser: undefined as string | undefined,
          skillInstalled: undefined as boolean | undefined,
          statusChecked: false,
        }));
        setTools(toolsList);
        setListLoading(false);

        // Fire off individual status checks - each resolves independently
        for (const tool of toolsList) {
          void checkSingleToolStatus(tool.id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch utility tools list:', error);
    } finally {
      if (mountedRef.current) {
        setListLoading(false);
      }
    }
  }, [checkSingleToolStatus]);

  useEffect(() => {
    void fetchToolsAndCheckStatus();
  }, [fetchToolsAndCheckStatus]);

  const handleInstall = useCallback(
    (tool: UtilityToolInfo) => {
      if (!tool.installCommand) return;

      modal.confirm({
        title: t('settings.utilityTools.installConfirmTitle', { defaultValue: 'Install {{name}}', name: tool.name }),
        content: (
          <div className='space-y-8px'>
            <div className='text-14px text-t-secondary'>{t('settings.utilityTools.installConfirmDesc', { defaultValue: 'This will run the following command on your system:' })}</div>
            <div className='bg-fill-2 rd-8px px-12px py-8px font-mono text-13px text-t-primary break-all'>{tool.installCommand}</div>
            {tool.hasSkill && <div className='text-12px text-t-secondary mt-8px'>{t('settings.utilityTools.skillAutoInstall', { defaultValue: 'A skill will also be installed to help AI agents use this tool effectively.' })}</div>}
          </div>
        ),
        okText: t('settings.cliTools.installBtn', { defaultValue: 'Install' }),
        cancelText: t('common.cancel', { defaultValue: 'Cancel' }),
        onOk: async () => {
          setActionInProgress(`install-${tool.id}`);
          try {
            const result = await ipcBridge.utilityTools.install.invoke({ toolId: tool.id });
            if (result.success) {
              message.success(t('settings.utilityTools.installSuccess', { defaultValue: '{{name}} installed successfully!', name: tool.name }));
              await checkSingleToolStatus(tool.id);
            } else {
              message.error(result.msg || t('settings.cliTools.installFailed', { defaultValue: 'Installation failed' }));
            }
          } catch {
            message.error(t('settings.cliTools.installFailed', { defaultValue: 'Installation failed' }));
          } finally {
            setActionInProgress(null);
          }
        },
      });
    },
    [modal, message, t, checkSingleToolStatus]
  );

  const handleUpdate = useCallback(
    async (tool: UtilityToolInfo) => {
      setActionInProgress(`update-${tool.id}`);
      try {
        const result = await ipcBridge.utilityTools.update.invoke({ toolId: tool.id });
        if (result.success) {
          message.success(t('settings.utilityTools.updateSuccess', { defaultValue: '{{name}} updated successfully!', name: tool.name }));
          await checkSingleToolStatus(tool.id);
        } else {
          message.error(result.msg || t('settings.utilityTools.updateFailed', { defaultValue: 'Update failed' }));
        }
      } catch {
        message.error(t('settings.utilityTools.updateFailed', { defaultValue: 'Update failed' }));
      } finally {
        setActionInProgress(null);
      }
    },
    [message, t, checkSingleToolStatus]
  );

  const handleLogin = useCallback(
    async (tool: UtilityToolInfo) => {
      setActionInProgress(`login-${tool.id}`);
      try {
        const result = await ipcBridge.utilityTools.login.invoke({ toolId: tool.id });
        if (result.success) {
          message.success(t('settings.utilityTools.loginSuccess', { defaultValue: 'Logged in to {{name}} successfully!', name: tool.name }));
          await checkSingleToolStatus(tool.id);
        } else {
          message.error(result.msg || t('settings.utilityTools.loginFailed', { defaultValue: 'Login failed' }));
        }
      } catch {
        message.error(t('settings.utilityTools.loginFailed', { defaultValue: 'Login failed' }));
      } finally {
        setActionInProgress(null);
      }
    },
    [message, t, checkSingleToolStatus]
  );

  const handleInstallSkill = useCallback(
    async (tool: UtilityToolInfo) => {
      setActionInProgress(`skill-${tool.id}`);
      try {
        const result = await ipcBridge.utilityTools.installSkill.invoke({ toolId: tool.id });
        if (result.success) {
          message.success(
            t('settings.utilityTools.skillInstallSuccess', {
              defaultValue: 'Skill "{{skillName}}" installed successfully!',
              skillName: result.data?.skillName,
            })
          );
          await checkSingleToolStatus(tool.id);
        } else {
          message.error(result.msg || t('settings.utilityTools.skillInstallFailed', { defaultValue: 'Skill installation failed' }));
        }
      } catch {
        message.error(t('settings.utilityTools.skillInstallFailed', { defaultValue: 'Skill installation failed' }));
      } finally {
        setActionInProgress(null);
      }
    },
    [message, t, checkSingleToolStatus]
  );

  const handleCopyCommand = useCallback(
    (command: string) => {
      void navigator.clipboard.writeText(command).then(() => {
        message.success(t('settings.cliTools.copied', { defaultValue: 'Copied to clipboard' }));
      });
    },
    [message, t]
  );

  const handleOpenUrl = useCallback((url: string) => {
    void ipcBridge.shell.openExternal.invoke(url);
  }, []);

  const isRefreshing = checkingTools.size > 0;

  return (
    <div className='flex flex-col gap-16px min-h-0'>
      {messageContext}
      {modalContext}

      {/* Header */}
      <div className='flex gap-8px items-center justify-between'>
        <div className='text-14px text-t-primary'>{t('settings.utilityTools.title', { defaultValue: 'Utility CLI Tools' })}</div>
        <Tooltip content={t('settings.cliTools.refresh', { defaultValue: 'Refresh' })}>
          <Button type='text' size='small' icon={<Refresh theme='outline' size='16' fill={iconColors.secondary} />} loading={isRefreshing} onClick={() => void fetchToolsAndCheckStatus()} />
        </Tooltip>
      </div>

      <div className='text-12px text-t-secondary'>{t('settings.utilityTools.description', { defaultValue: 'Manage utility CLI tools that AI agents can use for development tasks.' })}</div>

      {listLoading ? (
        <div className='py-24px flex justify-center'>
          <Spin size={24} />
        </div>
      ) : (
        <div className='space-y-12px'>
          {tools.map((tool) => {
            const isChecking = checkingTools.has(tool.id);
            const statusKnown = tool.statusChecked;

            return (
              <div key={tool.id} className='flex flex-col gap-8px py-12px border-b border-border-2 last:border-b-0'>
                {/* Tool header row */}
                <div className='flex items-center justify-between gap-16px'>
                  <div className='flex items-center gap-12px min-w-0 flex-1'>
                    {isChecking ? <Spin size={18} className='flex-shrink-0' /> : tool.installed ? <CheckOne theme='filled' size='18' fill='rgb(var(--green-6))' className='flex-shrink-0' /> : <CloseOne theme='filled' size='18' fill='rgb(var(--gray-5))' className='flex-shrink-0' />}
                    <div className='min-w-0'>
                      <div className='text-14px text-t-primary font-medium'>{tool.name}</div>
                      <div className='text-12px text-t-secondary font-mono'>{tool.cliCommand}</div>
                    </div>
                  </div>
                  <div className='flex items-center gap-8px flex-shrink-0'>
                    {tool.version && (
                      <Tag size='small' color='arcoblue'>
                        {tool.version}
                      </Tag>
                    )}
                    {statusKnown && tool.installed && tool.loggedIn !== undefined && (
                      <Tag size='small' color={tool.loggedIn ? 'green' : 'orangered'}>
                        {tool.loggedIn ? t('settings.utilityTools.loggedInAs', { defaultValue: 'Logged in{{user}}', user: tool.loginUser ? `: ${tool.loginUser}` : '' }) : t('settings.utilityTools.notLoggedIn', { defaultValue: 'Not logged in' })}
                      </Tag>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div className='text-12px text-t-secondary pl-30px'>{tool.description}</div>

                {/* Actions row - only show when status is known */}
                {statusKnown && (
                  <div className='flex items-center gap-8px pl-30px flex-wrap'>
                    {!tool.installed ? (
                      <>
                        {tool.installCommand && (
                          <>
                            <Button type='primary' size='mini' loading={actionInProgress === `install-${tool.id}`} icon={<DownloadOne theme='outline' size='14' />} onClick={() => handleInstall(tool)}>
                              {t('settings.cliTools.installBtn', { defaultValue: 'Install' })}
                            </Button>
                            <Tooltip content={tool.installCommand}>
                              <Button type='text' size='mini' icon={<Copy theme='outline' size='14' fill={iconColors.secondary} />} onClick={() => handleCopyCommand(tool.installCommand!)} />
                            </Tooltip>
                          </>
                        )}
                        {tool.installUrl && (
                          <Tooltip content={t('settings.cliTools.installGuide', { defaultValue: 'Installation guide' })}>
                            <Button type='text' size='mini' icon={<LinkCloud theme='outline' size='14' fill={iconColors.secondary} />} onClick={() => handleOpenUrl(tool.installUrl!)} />
                          </Tooltip>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Update button */}
                        {tool.updateCommand && (
                          <Tooltip content={t('settings.utilityTools.updateTooltip', { defaultValue: 'Update {{name}}', name: tool.name })}>
                            <Button type='outline' size='mini' loading={actionInProgress === `update-${tool.id}`} icon={<UpdateRotation theme='outline' size='14' />} onClick={() => void handleUpdate(tool)}>
                              {t('settings.utilityTools.updateBtn', { defaultValue: 'Update' })}
                            </Button>
                          </Tooltip>
                        )}

                        {/* Login button */}
                        {tool.loginCommand && (
                          <Tooltip content={tool.loggedIn ? t('settings.utilityTools.reloginTooltip', { defaultValue: 'Re-login to {{name}}', name: tool.name }) : t('settings.utilityTools.loginTooltip', { defaultValue: 'Login to {{name}}', name: tool.name })}>
                            <Button type={tool.loggedIn ? 'outline' : 'primary'} size='mini' loading={actionInProgress === `login-${tool.id}`} icon={<Log theme='outline' size='14' />} onClick={() => void handleLogin(tool)}>
                              {tool.loggedIn ? t('settings.utilityTools.reloginBtn', { defaultValue: 'Re-login' }) : t('settings.utilityTools.loginBtn', { defaultValue: 'Login' })}
                            </Button>
                          </Tooltip>
                        )}

                        {/* Install skill button */}
                        {tool.hasSkill && !tool.skillInstalled && (
                          <Tooltip content={t('settings.utilityTools.installSkillTooltip', { defaultValue: 'Install skill to help AI agents use {{name}}', name: tool.name })}>
                            <Button type='outline' size='mini' loading={actionInProgress === `skill-${tool.id}`} icon={<DownloadOne theme='outline' size='14' />} onClick={() => void handleInstallSkill(tool)}>
                              {t('settings.utilityTools.installSkillBtn', { defaultValue: 'Install Skill' })}
                            </Button>
                          </Tooltip>
                        )}

                        {/* Skill installed indicator */}
                        {tool.hasSkill && tool.skillInstalled && (
                          <Tag size='small' color='green'>
                            {t('settings.utilityTools.skillInstalled', { defaultValue: 'Skill installed' })}
                          </Tag>
                        )}

                        {/* Docs link */}
                        {tool.installUrl && (
                          <Tooltip content={t('settings.cliTools.viewDocs', { defaultValue: 'View documentation' })}>
                            <Button type='text' size='mini' icon={<LinkCloud theme='outline' size='14' fill={iconColors.secondary} />} onClick={() => handleOpenUrl(tool.installUrl!)} />
                          </Tooltip>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * Standalone CLI Tools settings content component (for modal view).
 */
const CliToolsModalContent: React.FC = () => {
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  return (
    <div className='flex flex-col h-full w-full'>
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='px-[12px] md:px-[32px] py-[24px]'>
          <CliToolsSection isPageMode={isPageMode} />
        </div>
      </AionScrollArea>
    </div>
  );
};

export default CliToolsModalContent;
