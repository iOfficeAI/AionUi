/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { IProvider } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import { Button, Divider, Message, Popconfirm, Collapse, Tag, Switch, Tooltip } from '@arco-design/web-react';
import { DeleteFour, Info, Minus, Plus, Write, Heartbeat } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import AddModelModal from '@/renderer/pages/settings/components/AddModelModal';
import AddPlatformModal from '@/renderer/pages/settings/components/AddPlatformModal';
import { isNewApiPlatform, NEW_API_PROTOCOL_OPTIONS } from '@/renderer/utils/model/modelPlatforms';
import EditModeModal from '@/renderer/pages/settings/components/EditModeModal';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useSettingsViewMode } from '../settingsViewContext';
import { consumePendingDeepLink } from '@/renderer/hooks/system/useDeepLink';
import '../model-provider.css';

/**
 * 获取协议显示标签颜色
 * Get protocol badge color
 */
const getProtocolColor = (protocol: string): string => {
  switch (protocol) {
    case 'gemini':
      return 'blue';
    case 'anthropic':
      return 'orange';
    case 'openai':
    default:
      return 'green';
  }
};

/**
 * 获取协议显示名称
 * Get protocol display name
 */
const getProtocolLabel = (protocol: string): string => {
  return NEW_API_PROTOCOL_OPTIONS.find((p) => p.value === protocol)?.label || 'OpenAI';
};

/**
 * 获取下一个协议（循环切换）
 * Get next protocol (cycle through options)
 */
const getNextProtocol = (current: string): string => {
  const idx = NEW_API_PROTOCOL_OPTIONS.findIndex((p) => p.value === current);
  const nextIdx = (idx + 1) % NEW_API_PROTOCOL_OPTIONS.length;
  return NEW_API_PROTOCOL_OPTIONS[nextIdx].value;
};

// Calculate API Key count
const getApiKeyCount = (apiKey: string): number => {
  if (!apiKey) return 0;
  return apiKey.split(/[,\n]/).filter((k) => k.trim().length > 0).length;
};

/**
 * 获取供应商的启用状态（全选/半选/全不选）
 * Get provider enable state (all/partial/none)
 */
const getProviderState = (platform: IProvider): { checked: boolean; indeterminate: boolean } => {
  if (!platform.modelEnabled) {
    // 没有 modelEnabled 记录，默认全部启用
    return { checked: true, indeterminate: false };
  }

  const enabledCount = platform.model.filter((model) => platform.modelEnabled?.[model] !== false).length;
  const totalCount = platform.model.length;

  if (enabledCount === 0) {
    return { checked: false, indeterminate: false }; // 全不选
  } else if (enabledCount === totalCount) {
    return { checked: true, indeterminate: false }; // 全选
  } else {
    return { checked: true, indeterminate: true }; // 半选（有模型开启，显示为开启状态）
  }
};

/**
 * 检查模型是否启用
 * Check if model is enabled
 */
const isModelEnabled = (platform: IProvider, model: string): boolean => {
  if (!platform.modelEnabled) return true; // 默认启用
  return platform.modelEnabled[model] !== false;
};

const HEALTH_CHECK_FIRST_RESPONSE_TIMEOUT_MS = 30000;

const ModelModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const [collapseKey, setCollapseKey] = useState<Record<string, boolean>>({});
  const [healthCheckLoading, setHealthCheckLoading] = useState<Record<string, boolean>>({});
  const { data, mutate } = useSWR('model.config', () => {
    return ipcBridge.mode.getModelConfig.invoke().then((data) => {
      if (!data) return [];
      return data;
    });
  });
  const [message, messageContext] = Message.useMessage();

  const saveModelConfig = (newData: IProvider[], success?: () => void) => {
    // 乐观更新：立即更新 UI
    void mutate(newData, false);

    ipcBridge.mode.saveModelConfig
      .invoke(newData)
      .then((data) => {
        if (data.success) {
          // 保存成功后重新验证数据
          void mutate();
          success?.();
        } else {
          // 保存失败，回滚到服务器数据
          void mutate();
          message.error(data.msg);
        }
      })
      .catch((error) => {
        // 保存失败，回滚到服务器数据
        void mutate();
        console.error('Failed to save model config:', error);
        message.error(t('settings.saveModelConfigFailed'));
      });
  };

  const updatePlatform = (platform: IProvider, success: () => void) => {
    const newData = (data || []).map((item) => (item.id === platform.id ? { ...item, ...platform } : item));
    // 如果是新平台，添加到列表
    if (!newData.find((item) => item.id === platform.id)) {
      newData.push(platform);
    }
    saveModelConfig(newData, success);
  };

  const removePlatform = (id: string) => {
    const newData = data.filter((item: IProvider) => item.id !== id);
    saveModelConfig(newData);
  };

  // 切换供应商启用状态（全选 ↔ 全不选）
  const toggleProviderEnabled = (platform: IProvider) => {
    const { checked } = getProviderState(platform);
    const newState = !checked; // 切换状态

    // 批量更新所有模型状态
    const modelEnabled: Record<string, boolean> = {};
    platform.model.forEach((model) => {
      modelEnabled[model] = newState;
    });

    const updated = {
      ...platform,
      modelEnabled,
    };
    updatePlatform(updated, () => {});
  };

  // 切换模型启用状态
  const toggleModelEnabled = (platform: IProvider, model: string, enabled: boolean) => {
    const modelEnabled = { ...platform.modelEnabled };
    modelEnabled[model] = enabled;

    const updated = {
      ...platform,
      modelEnabled,
    };

    updatePlatform(updated, () => {});
  };

  // 执行健康检测（复用现有对话请求逻辑）
  const performHealthCheck = async (platform: IProvider, modelName: string) => {
    const loadingKey = `${platform.id}-${modelName}`;
    setHealthCheckLoading((prev) => ({ ...prev, [loadingKey]: true }));

    const startTime = Date.now();
    let tempConversationId: string | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let unsubscribe: (() => void) | null = null;

    try {
      // 测活走统一对话链路，与常规请求路径保持一致
      const responseStream = ipcBridge.conversation.responseStream;

      // 1. 创建临时对话
      const conversation = await ipcBridge.conversation.create.invoke({
        type: 'gemini',
        name: `[Health Check] ${platform.name} - ${modelName}`,
        model: {
          ...platform,
          useModel: modelName,
        },
        extra: {
          workspace: '',
          isHealthCheck: true,
        },
      });

      tempConversationId = conversation.id;

      // 2. 设置响应监听器
      const responsePromise = new Promise<{ success: boolean; error?: string; latency: number }>((resolve, reject) => {
        let hasResolved = false;
        let requestTraceData: { backend?: string; modelId?: string; provider?: string } | null = null;

        const resolveOnce = (result: { success: boolean; error?: string; latency: number }) => {
          if (hasResolved) return;
          hasResolved = true;
          resolve(result);
        };

        const responseListener = (msg: IResponseMessage) => {
          if (msg.conversation_id !== tempConversationId) return;

          // 输出 request_trace 到 console（使用与对话相同的格式）
          if (msg.type === 'request_trace') {
            const trace = msg.data as Record<string, unknown>;
            requestTraceData = {
              backend: String(trace.backend || ''),
              modelId: String(trace.modelId || ''),
              provider: String(trace.platform || trace.provider || ''),
            };
            const displayName = requestTraceData.backend || requestTraceData.provider || 'unknown';
            console.log(
              `%c[Health Check]%c ➡️ START | ${displayName} → ${trace.modelId} | ${new Date().toISOString()}`,
              'color: #1890ff; font-weight: bold',
              'color: inherit',
              trace
            );
          }

          // 监听完成事件
          if (msg.type === 'error') {
            const duration = Date.now() - startTime;
            // 输出错误链路到 console
            if (requestTraceData) {
              const displayName = requestTraceData.backend || requestTraceData.provider || 'unknown';
              console.log(
                `%c[Health Check]%c ❌ ERROR | ${displayName} → ${requestTraceData.modelId} | ${duration}ms | ${new Date().toISOString()}`,
                'color: #ff4d4f; font-weight: bold',
                'color: inherit',
                msg.data
              );
            }
            resolveOnce({
              success: false,
              error: (msg.data as { error?: string } | undefined)?.error || 'Unknown error',
              latency: duration,
            });
            return;
          }

          if (msg.type === 'start') {
            return;
          }

          // 以“首个响应包到达时间”作为健康判定，避免流式完成时间过长影响检测
          const duration = Date.now() - startTime;
          if (requestTraceData) {
            const displayName = requestTraceData.backend || requestTraceData.provider || 'unknown';
            console.log(
              `%c[Health Check]%c ✅ FIRST_RESPONSE | ${displayName} → ${requestTraceData.modelId} | ${duration}ms | ${new Date().toISOString()}`,
              'color: #52c41a; font-weight: bold',
              'color: inherit'
            );
          }
          resolveOnce({ success: true, latency: duration });
        };

        unsubscribe = responseStream.on(responseListener);

        // 首个响应超时（默认 30s）
        timeoutId = setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true;
            if (requestTraceData) {
              const duration = Date.now() - startTime;
              const displayName = requestTraceData.backend || requestTraceData.provider || 'unknown';
              console.log(
                `%c[Health Check]%c ⏱️ FIRST_RESPONSE_TIMEOUT | ${displayName} → ${requestTraceData.modelId} | ${duration}ms | ${new Date().toISOString()}`,
                'color: #faad14; font-weight: bold',
                'color: inherit'
              );
            }
            reject(
              new Error(`Health check timeout (${HEALTH_CHECK_FIRST_RESPONSE_TIMEOUT_MS / 1000}s to first response)`)
            );
          }
        }, HEALTH_CHECK_FIRST_RESPONSE_TIMEOUT_MS);
      });

      // 3. 发送测试消息
      await ipcBridge.conversation.sendMessage.invoke({
        conversation_id: tempConversationId,
        input: 'ping',
        msg_id: uuid(),
      });

      // 4. 等待响应
      const result = await responsePromise;

      // 5. 更新健康状态
      const latency = result.latency;

      // 直接保存，不使用乐观更新，避免并发时互相覆盖
      try {
        // 先获取最新的数据，确保不会覆盖其他并发的更新
        const latestData = await ipcBridge.mode.getModelConfig.invoke();
        const newData = (latestData || []).map((item) => {
          if (item.id === platform.id) {
            const modelHealth = { ...item.modelHealth };
            modelHealth[modelName] = {
              status: result.success ? 'healthy' : 'unhealthy',
              lastCheck: Date.now(),
              latency,
              error: result.error,
            };
            return { ...item, modelHealth };
          }
          return item;
        });

        const saveResult = await ipcBridge.mode.saveModelConfig.invoke(newData);
        if (saveResult.success) {
          // 保存成功后重新验证数据
          await mutate();
          if (result.success) {
            Message.success({
              content: `${platform.name} - ${modelName}: ${t('common.success')} (${latency}ms)`,
              duration: 3000,
            });
          } else {
            Message.error({
              content: `${platform.name} - ${modelName}: ${t('common.failed')} - ${result.error}`,
              duration: 5000,
            });
          }
        } else {
          Message.error({
            content: saveResult.msg || t('settings.saveModelConfigFailed'),
            duration: 3000,
          });
        }
      } catch (saveError) {
        console.error('Failed to save health check result:', saveError);
        Message.error({
          content: t('settings.saveModelConfigFailed'),
          duration: 3000,
        });
      }
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      Message.error({
        content: `${platform.name} - ${modelName}: ${t('common.failed')} - ${errorMessage}`,
        duration: 5000,
      });

      // 直接保存，不使用乐观更新
      try {
        // 先获取最新的数据，确保不会覆盖其他并发的更新
        const latestData = await ipcBridge.mode.getModelConfig.invoke();
        const newData = (latestData || []).map((item) => {
          if (item.id === platform.id) {
            const modelHealth = { ...item.modelHealth };
            modelHealth[modelName] = {
              status: 'unhealthy',
              lastCheck: Date.now(),
              latency,
              error: errorMessage,
            };
            return { ...item, modelHealth };
          }
          return item;
        });

        const saveResult = await ipcBridge.mode.saveModelConfig.invoke(newData);
        if (saveResult.success) {
          await mutate();
        }
      } catch (saveError) {
        console.error('Failed to save health check result:', saveError);
      }
    } finally {
      // 清理
      if (timeoutId) clearTimeout(timeoutId);
      if (unsubscribe) {
        unsubscribe();
      }
      if (tempConversationId) {
        // 删除临时对话
        ipcBridge.conversation.remove.invoke({ id: tempConversationId }).catch(() => {});
      }
      setHealthCheckLoading((prev) => ({ ...prev, [loadingKey]: false }));
    }
  };

  const clearAllHealthData = () => {
    if (!data) return;
    const newData: IProvider[] = data.map((platform: IProvider) => ({
      ...platform,
      modelHealth: undefined as IProvider['modelHealth'],
    }));
    saveModelConfig(newData, () => {
      Message.success({
        content: t('settings.healthStatusCleared'),
        duration: 2000,
      });
    });
  };

  const [addPlatformModalCtrl, addPlatformModalContext] = AddPlatformModal.useModal({
    onSubmit(platform) {
      updatePlatform(platform, () => addPlatformModalCtrl.close());
    },
  });

  // Consume pending deep-link data on mount (set by useDeepLink hook before navigation)
  useEffect(() => {
    const pending = consumePendingDeepLink();
    if (pending) {
      addPlatformModalCtrl.open({ deepLinkData: pending });
    }
  }, [addPlatformModalCtrl]);

  const [addModelModalCtrl, addModelModalContext] = AddModelModal.useModal({
    onSubmit(platform) {
      updatePlatform(platform, () => {
        addModelModalCtrl.close();
      });
    },
  });

  const [editModalCtrl, editModalContext] = EditModeModal.useModal({
    onChange(platform) {
      updatePlatform(platform, () => editModalCtrl.close());
    },
  });

  return (
    <div className='flex flex-col bg-2 rd-16px px-16px md:px-24px lg:px-28px py-16px md:py-18px'>
      {messageContext}
      {addPlatformModalContext}
      {editModalContext}
      {addModelModalContext}

      {/* Header with Add Button */}
      <div className='flex-shrink-0 border-b border-[var(--color-border-2)] pb-12px mb-14px flex items-center justify-between gap-8px flex-wrap'>
        <div className='text-20px font-600 text-t-primary leading-34px'>{t('settings.model')}</div>
        <div className='flex items-center gap-8px flex-wrap'>
          <Button
            type='outline'
            shape='round'
            size='small'
            onClick={clearAllHealthData}
            className='rd-100px border-1 border-solid border-[var(--color-border-2)] h-34px px-14px text-t-secondary hover:text-t-primary'
          >
            {t('settings.clearStatus')}
          </Button>
          <Button
            type='outline'
            shape='round'
            icon={<Plus size='16' />}
            onClick={() => addPlatformModalCtrl.open()}
            className='rd-100px border-1 border-solid border-[var(--color-border-2)] h-34px px-14px text-t-secondary hover:text-t-primary'
          >
            {t('settings.addModel')}
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <AionScrollArea className='flex-1 min-h-0' disableOverflow={isPageMode}>
        {!data || data.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-40px'>
            <Info theme='outline' size='48' className='text-t-secondary mb-16px' />
            <h3 className='text-16px font-500 text-t-primary mb-8px'>{t('settings.noConfiguredModels')}</h3>
            <p className='text-14px text-t-secondary text-center max-w-400px'>
              {t('settings.needHelpConfigGuide')}
              <a
                href='https://github.com/iOfficeAI/AionUi/wiki/LLM-Configuration'
                target='_blank'
                rel='noopener noreferrer'
                className='text-[rgb(var(--primary-6))] hover:text-[rgb(var(--primary-5))] underline ml-4px'
              >
                {t('settings.configGuide')}
              </a>
              {t('settings.configGuideSuffix')}
            </p>
          </div>
        ) : (
          <div className='space-y-16px'>
            {(data || []).map((platform: IProvider) => {
              const key = platform.id;
              const isExpanded = collapseKey[platform.id] ?? false;
              return (
                <Collapse
                  activeKey={isExpanded ? ['image-generation'] : []}
                  onChange={(_, activeKeys) => {
                    const expanded = activeKeys.includes('image-generation');
                    setCollapseKey((prev) => ({ ...prev, [platform.id]: expanded }));
                  }}
                  key={key}
                  bordered
                  expandIconPosition='left'
                  className={`[&_.arco-collapse-item]:!border-0 [&_.arco-collapse-item]:!rounded-12px [&_.arco-collapse-item]:!overflow-hidden [&_.arco-collapse-item]:!bg-[var(--color-bg-2)] [&_.arco-collapse-item-header]:!bg-[var(--fill-0)] [&_.arco-collapse-item-header]:!pl-36px [&_.arco-collapse-item-header]:!pr-12px [&_.arco-collapse-item-header]:!py-8px [&_.arco-collapse-item-header]:transition-colors [&_.arco-collapse-item-header]:hover:!bg-[var(--color-bg-2)] [&_.arco-collapse-item-header]:!gap-8px [&_.arco-collapse-item-header-title]:!min-w-0 [&_.arco-collapse-item-header-icon]:!text-2 [&_.arco-collapse-item-header:hover_.arco-collapse-item-header-icon]:!text-1 [&_.arco-collapse-item-content]:!bg-fill-1 [&_.arco-collapse-item-content-box]:!px-10px [&_.arco-collapse-item-content-box]:!py-8px [&_.arco-collapse-item-content]:!border-t [&_.arco-collapse-item-content]:!border-[var(--color-border-2)] ${
                    isExpanded
                      ? '[&_.arco-collapse-item-header]:!rounded-t-12px [&_.arco-collapse-item-header]:!rounded-b-0 [&_.arco-collapse-item-content]:!rounded-b-12px'
                      : '[&_.arco-collapse-item-header]:!rounded-12px'
                  }`}
                >
                  <Collapse.Item
                    name='image-generation'
                    className='[&_.arco-collapse-item-header-title]:flex-1 group'
                    header={
                      <div className='group flex items-center justify-between w-full min-h-32px gap-8px min-w-0'>
                        <span
                          className={`text-14px font-500 truncate min-w-0 transition-colors ${isExpanded ? 'text-t-primary' : 'text-2 group-hover:text-1'}`}
                        >
                          {platform.name}
                        </span>
                        <div
                          className='flex items-center gap-8px shrink-0'
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <span className='text-12px text-t-secondary whitespace-nowrap hidden md:inline-flex items-center overflow-hidden max-w-0 opacity-0 group-hover:max-w-320px group-hover:opacity-100 transition-all duration-180'>
                            <span
                              className='cursor-pointer hover:text-t-primary transition-colors'
                              onClick={() => setCollapseKey((prev) => ({ ...prev, [platform.id]: !isExpanded }))}
                            >
                              {t('settings.modelCount')}（{platform.model.length}）
                            </span>
                            <span className='mx-6px'>|</span>
                            <span
                              className='cursor-pointer hover:text-t-primary transition-colors'
                              onClick={() => editModalCtrl.open({ data: platform })}
                            >
                              {t('settings.apiKeyCount')}（{getApiKeyCount(platform.apiKey)}）
                            </span>
                          </span>
                          <span className='text-12px text-t-secondary whitespace-nowrap md:hidden'>
                            {platform.model.length} / {getApiKeyCount(platform.apiKey)}
                          </span>
                          {/* 供应商启用开关 / Provider enable switch */}
                          <Switch
                            size='small'
                            checked={getProviderState(platform).checked}
                            onChange={() => toggleProviderEnabled(platform)}
                          />
                          <div className='flex items-center gap-4px'>
                            <Button
                              size='mini'
                              className='model-provider-action-btn !w-28px !h-28px !min-w-28px text-t-secondary hover:text-t-primary'
                              icon={<Plus size='14' />}
                              onClick={() => addModelModalCtrl.open({ data: platform })}
                            />
                            <Popconfirm
                              title={t('settings.deleteAllModelConfirm')}
                              onOk={() => removePlatform(platform.id)}
                            >
                              <Button
                                size='mini'
                                className='model-provider-action-btn !w-28px !h-28px !min-w-28px text-t-secondary hover:text-t-primary'
                                icon={<Minus size='14' />}
                              />
                            </Popconfirm>
                            <Button
                              size='mini'
                              className='model-provider-action-btn !w-28px !h-28px !min-w-28px text-t-secondary hover:text-t-primary'
                              icon={<Write size='14' />}
                              onClick={() => editModalCtrl.open({ data: platform })}
                            />
                          </div>
                        </div>
                      </div>
                    }
                  >
                    {platform.model.map((model: string, index: number, arr: string[]) => {
                      const isNewApiProvider = isNewApiPlatform(platform.platform);
                      const modelProtocol = platform.modelProtocols?.[model] || 'openai';
                      const modelHealth = platform.modelHealth?.[model];
                      const healthStatus = modelHealth?.status || 'unknown';

                      return (
                        <div key={model}>
                          <div className='flex items-center justify-between px-8px py-12px transition-colors hover:bg-[var(--fill-0)]'>
                            <div className='flex items-center gap-8px'>
                              {/* 健康状态指示器 / Health status indicator */}
                              {healthStatus !== 'unknown' && (
                                <Tooltip
                                  content={
                                    <div>
                                      <div className='flex items-center gap-4px'>
                                        <span>{healthStatus === 'healthy' ? '✅' : '❌'}</span>
                                        <span>
                                          {healthStatus === 'healthy' ? t('common.success') : t('common.failed')}
                                        </span>
                                      </div>
                                      {modelHealth?.latency && (
                                        <div className='text-12px mt-4px'>
                                          {t('settings.latency')}: {modelHealth.latency}ms
                                        </div>
                                      )}
                                      {modelHealth?.error && (
                                        <div className='text-12px mt-4px'>{modelHealth.error}</div>
                                      )}
                                      {modelHealth?.lastCheck && (
                                        <div className='text-12px mt-4px'>
                                          {t('mcp.lastCheck')}: {new Date(modelHealth.lastCheck).toLocaleString()}
                                        </div>
                                      )}
                                    </div>
                                  }
                                >
                                  <div
                                    className={`w-8px h-8px rounded-full ${healthStatus === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`}
                                  />
                                </Tooltip>
                              )}

                              <span className='text-14px text-t-primary'>{model}</span>

                              {/* New API 协议标签（点击循环切换）/ New API protocol badge (click to cycle) */}
                              {isNewApiProvider && (
                                <Tag
                                  size='small'
                                  color={getProtocolColor(modelProtocol)}
                                  className='cursor-pointer select-none'
                                  onClick={() => {
                                    const nextProtocol = getNextProtocol(modelProtocol);
                                    const newProtocols = { ...platform.modelProtocols };
                                    newProtocols[model] = nextProtocol;
                                    updatePlatform({ ...platform, modelProtocols: newProtocols }, () => {});
                                  }}
                                >
                                  {getProtocolLabel(modelProtocol)}
                                </Tag>
                              )}

                              {/* 模型启用开关 / Model enable switch */}
                              <Switch
                                size='small'
                                checked={isModelEnabled(platform, model)}
                                onChange={(checked) => toggleModelEnabled(platform, model, checked)}
                              />
                            </div>

                            <div className='flex items-center gap-6px shrink-0'>
                              {/* 心跳检测按钮 / Health check button */}
                              <Tooltip content={t('settings.healthCheck')}>
                                <Button
                                  size='mini'
                                  className='!w-28px !h-28px !min-w-28px !bg-[var(--color-bg-1)] text-t-secondary hover:text-t-primary hover:!bg-[var(--fill-0)]'
                                  icon={<Heartbeat theme='outline' size='16' />}
                                  loading={healthCheckLoading[`${platform.id}-${model}`]}
                                  onClick={() => performHealthCheck(platform, model)}
                                />
                              </Tooltip>

                              <Popconfirm
                                title={t('settings.deleteModelConfirm')}
                                onOk={() => {
                                  const newModels = platform.model.filter((item: string) => item !== model);
                                  // 同时清理模型相关状态，避免删除后重加模型时复用脏状态
                                  // Clean all per-model state to avoid stale state on re-add.
                                  const newProtocols = { ...platform.modelProtocols };
                                  const newModelEnabled = { ...platform.modelEnabled };
                                  const newModelHealth = { ...platform.modelHealth };
                                  delete newProtocols[model];
                                  delete newModelEnabled[model];
                                  delete newModelHealth[model];

                                  updatePlatform(
                                    {
                                      ...platform,
                                      model: newModels,
                                      modelProtocols: Object.keys(newProtocols).length > 0 ? newProtocols : undefined,
                                      modelEnabled:
                                        Object.keys(newModelEnabled).length > 0 ? newModelEnabled : undefined,
                                      modelHealth: Object.keys(newModelHealth).length > 0 ? newModelHealth : undefined,
                                    },
                                    () => {}
                                  );
                                }}
                              >
                                <Button
                                  size='mini'
                                  className='!w-28px !h-28px !min-w-28px !bg-[var(--color-bg-1)] text-t-secondary hover:text-t-primary hover:!bg-[var(--fill-0)]'
                                  icon={<DeleteFour theme='outline' size='18' strokeWidth={2} />}
                                />
                              </Popconfirm>
                            </div>
                          </div>
                          {index < arr.length - 1 && <Divider className='!my-0 !border-[var(--color-border-2)]/70' />}
                        </div>
                      );
                    })}
                  </Collapse.Item>
                </Collapse>
              );
            })}
          </div>
        )}
      </AionScrollArea>
    </div>
  );
};

export default ModelModalContent;
