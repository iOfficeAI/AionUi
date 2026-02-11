import { ipcBridge } from '@/common';
import type { IConfirmation } from '@/common/chatLib';
import { useConversationContextSafe } from '@/renderer/context/ConversationContext';
import { Divider, Typography } from '@arco-design/web-react';
import type { PropsWithChildren } from 'react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { removeStack } from '../../../utils/common';

const ConversationChatConfirm: React.FC<PropsWithChildren<{ conversation_id: string }>> = ({ conversation_id, children }) => {
  const [confirmations, setConfirmations] = useState<IConfirmation<any>[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { t } = useTranslation();
  const conversationContext = useConversationContextSafe();
  const agentType = conversationContext?.type || 'unknown';

  // Check if confirmation should be auto-confirmed via backend approval store
  // 通过后端 approval store 检查是否应该自动确认
  // Keys are parsed in backend (single source of truth)
  // Keys 在后端解析（单一数据源）
  const checkAndAutoConfirm = useCallback(
    async (confirmation: IConfirmation<string>): Promise<boolean> => {
      // Only check gemini agent type (others don't have approval store yet)
      if (agentType !== 'gemini') return false;

      const { action, commandType } = confirmation;
      // Skip if no action (backend will return false for empty keys)
      if (!action) return false;

      try {
        const isApproved = await ipcBridge.conversation.approval.check.invoke({
          conversation_id,
          action,
          commandType,
        });

        if (isApproved) {
          // Find the "proceed_always" or "proceed_once" option to use for auto-confirm
          const allowOption = confirmation.options.find((opt) => opt.value === 'proceed_always' || opt.value === 'proceed_once');
          if (allowOption) {
            void ipcBridge.conversation.confirmation.confirm.invoke({
              conversation_id,
              callId: confirmation.callId,
              msg_id: confirmation.id,
              data: allowOption.value,
            });
            return true;
          }
        }
      } catch {
        // Ignore errors, will show confirmation dialog
      }

      return false;
    },
    [conversation_id, agentType]
  );

  useEffect(() => {
    // Fix #475: Add error handling and retry mechanism
    let retryCount = 0;
    const maxRetries = 3;

    const loadConfirmations = async () => {
      try {
        const data = await ipcBridge.conversation.confirmation.list.invoke({ conversation_id });
        // Filter out confirmations that should be auto-confirmed (async)
        const manualConfirmations: IConfirmation<any>[] = [];
        for (const c of data) {
          const shouldAutoConfirm = await checkAndAutoConfirm(c);
          if (!shouldAutoConfirm) {
            manualConfirmations.push(c);
          }
        }
        setConfirmations(manualConfirmations);
        setLoadError(null);
      } catch (error) {
        console.error('[ConversationChatConfirm] Failed to load confirmations:', error);
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(loadConfirmations, 1000);
        } else {
          const errorMsg = error instanceof Error ? error.message : 'Failed to load confirmations';
          setLoadError(errorMsg);
        }
      }
    };

    void loadConfirmations();

    return removeStack(
      ipcBridge.conversation.confirmation.add.on((data) => {
        if (conversation_id !== data.conversation_id) return;
        // Check if should auto-confirm (async)
        void checkAndAutoConfirm(data).then((autoConfirmed) => {
          if (!autoConfirmed) {
            setConfirmations((prev) => prev.concat(data));
            setLoadError(null);
          }
        });
      }),
      ipcBridge.conversation.confirmation.remove.on((data) => {
        if (conversation_id !== data.conversation_id) return;
        setConfirmations((prev) => prev.filter((p) => p.id !== data.id));
      }),
      ipcBridge.conversation.confirmation.update.on(({ ...data }) => {
        if (conversation_id !== data.conversation_id) return;
        setConfirmations((list) => {
          const original = list.find((p) => p.id === data.id);
          if (original) {
            Object.assign(original, data);
          }
          return list.slice();
        });
      })
    );
  }, [conversation_id, checkAndAutoConfirm]);

  // Handle ESC key to cancel confirmation
  useEffect(() => {
    if (!confirmations.length) return;

    const confirmation = confirmations[0];
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Find cancel option (value is 'cancel')
        const cancelOption = confirmation.options.find((opt) => opt.value === 'cancel');
        if (cancelOption) {
          event.preventDefault();
          setConfirmations((prev) => prev.filter((p) => p.id !== confirmation.id));
          void ipcBridge.conversation.confirmation.confirm.invoke({
            conversation_id,
            callId: confirmation.callId,
            msg_id: confirmation.id,
            data: cancelOption.value,
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [confirmations, conversation_id]);
  // 修复 #475: 如果加载出错，显示错误信息和重试按钮
  // Fix #475: If loading fails, show error message and retry button
  if (loadError && !confirmations.length) {
    return (
      <div>
        {/* 错误提示卡片 / Error notification card */}
        <div
          className={`relative p-16px bg-white flex flex-col overflow-hidden m-b-20px rd-20px max-w-800px w-full mx-auto box-border`}
          style={{
            boxShadow: '0px 2px 20px 0px rgba(74, 88, 250, 0.1)',
          }}
        >
          {/* 错误标题 / Error title */}
          <div className='color-[rgba(217,45,32,1)] text-14px font-medium mb-8px'>{t('conversation.confirmationLoadError', 'Failed to load confirmation dialog')}</div>
          {/* 错误详情 / Error details */}
          <div className='text-12px color-[rgba(134,144,156,1)] mb-12px'>{loadError}</div>
          {/* 手动重试按钮 / Manual retry button */}
          <button
            onClick={() => {
              setLoadError(null);
              void ipcBridge.conversation.confirmation.list
                .invoke({ conversation_id })
                .then((data) => setConfirmations(data))
                .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load'));
            }}
            className='px-12px py-6px bg-[rgba(22,93,255,1)] text-white rd-6px text-12px cursor-pointer hover:opacity-80 transition-opacity'
          >
            {t('common.retry', 'Retry')}
          </button>
        </div>
        {children}
      </div>
    );
  }

  const hasConfirmation = confirmations.length > 0;
  const confirmation = hasConfirmation ? confirmations[0] : null;
  const $t = (key: string, params?: Record<string, string>) => t(key, { ...params, defaultValue: key });

  // Keep children in a stable tree position to prevent unmount/remount when confirmation state changes.
  // Previously, switching between <>{children}</> and <div>...<div className='hidden'>{children}</div></div>
  // caused React to unmount and remount children (e.g., AcpSendBox), which triggered duplicate message sends.
  return (
    <>
      {hasConfirmation && confirmation && (
        <div
          className={`relative p-16px bg-white flex flex-col overflow-hidden m-b-20px rd-20px max-w-800px max-h-[calc(100vh-200px)] w-full mx-auto box-border`}
          style={{
            boxShadow: '0px 2px 20px 0px rgba(74, 88, 250, 0.1)',
          }}
        >
          <div className='color-[rgba(29,33,41,1)] text-16px font-bold shrink-0'>{$t(confirmation.title) || 'Choose an action'}:</div>
          <Divider className={'!my-10px shrink-0'}></Divider>
          <div className='flex-1 overflow-y-auto min-h-0'>
            <Typography.Ellipsis className='text-14px color-[rgba(29,33,41,1)]' rows={5} expandable>
              {$t(confirmation.description)}
            </Typography.Ellipsis>
          </div>
          <div className='shrink-0'>
            {confirmation.options.map((option, index) => {
              const label = $t(option.label, option.params);
              return (
                <div
                  onClick={() => {
                    // Note: "always allow" is stored by backend when proceed_always is confirmed
                    // 注意：后端会在确认 proceed_always 时自动存储权限
                    setConfirmations((prev) => prev.filter((p) => p.id !== confirmation.id));
                    void ipcBridge.conversation.confirmation.confirm.invoke({ conversation_id, callId: confirmation.callId, msg_id: confirmation.id, data: option.value });
                  }}
                  key={label + option.value + index}
                  className='b-1px b-solid h-30px lh-30px b-[rgba(229,230,235,1)] rd-8px px-12px hover:bg-[rgba(229,231,240,1)] cursor-pointer mt-10px'
                >
                  {label}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className={hasConfirmation ? 'hidden' : ''}>{children}</div>
    </>
  );
};

export default ConversationChatConfirm;
