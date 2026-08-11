import { ipcBridge } from '@/common';
import type { IConfirmation } from '@/common/chat/chatLib';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { Divider, Typography } from '@arco-design/web-react';
import type { PropsWithChildren } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { removeStack } from '../../../utils/common';

/** IConfirmation extended with the conversation it belongs to (needed for team-mode cross-agent routing) */
type StoredConfirmation = IConfirmation<any> & { conversation_id: string };

const ConversationChatConfirm: React.FC<PropsWithChildren<{ conversation_id: string }>> = ({
  conversation_id,
  children,
}) => {
  const [confirmations, setConfirmations] = useState<StoredConfirmation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { t } = useTranslation();
  const conversationContext = useConversationContextSafe();
  const agentType = conversationContext?.type || 'unknown';

  // Each agent's ConversationChatConfirm handles only its own conversation_id.
  // In team mode this gives per-agent in-slot confirmation dialogs (TeamConfirmOverlay removed).
  // In standalone mode: same behavior, single conversation.
  const listenConversationIds = useMemo(() => {
    return [conversation_id];
  }, [conversation_id]);

  // Check if confirmation should be auto-confirmed via backend approval store
  // 通过后端 approval store 检查是否应该自动确认
  // Keys are parsed in backend (single source of truth)
  // Keys 在后端解析（单一数据源）
  const checkAndAutoConfirm = useCallback(
    async (confirmation: StoredConfirmation): Promise<boolean> => {
      // Only check agent types that have approval store
      if (agentType !== 'gemini' && agentType !== 'aionrs') return false;

      const { action, commandType } = confirmation;
      // Skip if no action (backend will return false for empty keys)
      if (!action) return false;

      try {
        const isApproved = await ipcBridge.conversation.approval.check.invoke({
          conversation_id: confirmation.conversation_id,
          action,
          commandType,
        });

        if (isApproved) {
          // Find the "proceed_always" or "proceed_once" option to use for auto-confirm
          const allowOption = confirmation.options.find(
            (opt) => opt.value === 'proceed_always' || opt.value === 'proceed_once'
          );
          if (allowOption) {
            void ipcBridge.conversation.confirmation.confirm.invoke({
              conversation_id: confirmation.conversation_id,
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
    [agentType]
  );

  useEffect(() => {
    // Fix #475: Add error handling and retry mechanism
    let retryCount = 0;
    const maxRetries = 3;
    const idSet = new Set(listenConversationIds);

    const loadConfirmations = async () => {
      try {
        // Load confirmations for all listened conversation IDs
        const allData: StoredConfirmation[] = [];
        for (const cid of listenConversationIds) {
          const data = await ipcBridge.conversation.confirmation.list.invoke({ conversation_id: cid });
          allData.push(...data.map((c) => ({ ...c, conversation_id: cid })));
        }
        // Filter out confirmations that should be auto-confirmed (async)
        const manualConfirmations: StoredConfirmation[] = [];
        for (const c of allData) {
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
        if (!idSet.has(data.conversation_id)) return;
        // Check if should auto-confirm (async)
        const stored: StoredConfirmation = { ...data, conversation_id: data.conversation_id };
        void checkAndAutoConfirm(stored).then((autoConfirmed) => {
          if (!autoConfirmed) {
            setConfirmations((prev) => prev.concat(stored));
            setLoadError(null);
          }
        });
      }),
      ipcBridge.conversation.confirmation.remove.on((data) => {
        if (!idSet.has(data.conversation_id)) return;
        setConfirmations((prev) => prev.filter((p) => p.id !== data.id));
      }),
      ipcBridge.conversation.confirmation.update.on(({ ...data }) => {
        if (!idSet.has(data.conversation_id)) return;
        setConfirmations((list) => list.map((p) => (p.id === data.id ? { ...p, ...data } : p)));
      })
    );
  }, [listenConversationIds, checkAndAutoConfirm]);

  // Handle keyboard shortcuts for confirmation actions
  // 处理确认操作的键盘快捷键
  useEffect(() => {
    if (!confirmations.length) return;

    const confirmation = confirmations[0];

    const confirmOption = (option: (typeof confirmation.options)[number]) => {
      setConfirmations((prev) => prev.filter((p) => p.id !== confirmation.id));
      void ipcBridge.conversation.confirmation.confirm.invoke({
        conversation_id: confirmation.conversation_id,
        callId: confirmation.callId,
        msg_id: confirmation.id,
        data: option.value,
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if user is typing in an input
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const options = confirmation.options;

      // Enter → first option (typically Allow)
      if (event.key === 'Enter') {
        event.preventDefault();
        if (options[0]) confirmOption(options[0]);
        return;
      }

      // Escape / N → cancel
      if (event.key === 'Escape' || event.key.toLowerCase() === 'n') {
        const cancelOpt = options.find((opt) => opt.value === 'cancel');
        if (cancelOpt) {
          event.preventDefault();
          confirmOption(cancelOpt);
        }
        return;
      }

      // Y → proceed_once (Allow)
      if (event.key.toLowerCase() === 'y') {
        const allowOpt = options.find((opt) => opt.value === 'proceed_once');
        if (allowOpt) {
          event.preventDefault();
          confirmOption(allowOpt);
        }
        return;
      }

      // A → proceed_always (Always Allow)
      if (event.key.toLowerCase() === 'a') {
        const alwaysOpt = options.find((opt) => opt.value === 'proceed_always');
        if (alwaysOpt) {
          event.preventDefault();
          confirmOption(alwaysOpt);
        }
        return;
      }

      // Number keys 1-9 → select by index
      const num = parseInt(event.key, 10);
      if (num >= 1 && num <= options.length) {
        event.preventDefault();
        confirmOption(options[num - 1]);
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
          className={`relative p-16px bg-dialog-fill-0 flex flex-col overflow-hidden m-b-20px rd-20px max-w-800px w-full mx-auto box-border`}
          style={{
            boxShadow: '0px 2px 20px 0px rgba(74, 88, 250, 0.1)',
          }}
        >
          {/* 错误标题 / Error title */}
          <div className='color-[var(--danger)] text-14px font-medium mb-8px'>
            {t('conversation.chat.confirmationLoadError', 'Failed to load confirmation dialog')}
          </div>
          {/* 错误详情 / Error details */}
          <div className='text-12px color-[var(--text-secondary)] mb-12px'>{loadError}</div>
          {/* 手动重试按钮 / Manual retry button */}
          <button
            onClick={() => {
              setLoadError(null);
              void Promise.all(
                listenConversationIds.map((cid) =>
                  ipcBridge.conversation.confirmation.list
                    .invoke({ conversation_id: cid })
                    .then((data) => data.map((c) => ({ ...c, conversation_id: cid })))
                )
              )
                .then((results) => setConfirmations(results.flat()))
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
          className={`relative p-16px bg-dialog-fill-0 flex flex-col overflow-hidden m-b-20px rd-20px max-w-800px max-h-[calc(100vh-200px)] w-full mx-auto box-border`}
          style={{
            boxShadow: '0px 2px 20px 0px rgba(74, 88, 250, 0.1)',
          }}
        >
          <div className='flex-1 overflow-y-auto min-h-0'>
            <Typography.Ellipsis className='text-16px font-bold color-[var(--text-primary)]' rows={2} expandable>
              {$t(confirmation.title) || 'Choose an action'}
            </Typography.Ellipsis>
            <Divider className={'!my-10px'}></Divider>
            <Typography.Ellipsis className='text-14px color-[var(--text-primary)]' rows={5} expandable>
              {$t(confirmation.description)}
            </Typography.Ellipsis>
          </div>
          <div className='shrink-0'>
            {confirmation.options.map((option, index) => {
              const label = $t(option.label, option.params);
              // Determine shortcut hint for this option
              const shortcut =
                index === 0
                  ? 'Enter'
                  : option.value === 'cancel'
                    ? 'Esc'
                    : option.value === 'proceed_always'
                      ? 'A'
                      : option.value === 'proceed_once'
                        ? 'Y'
                        : String(index + 1);
              return (
                <div
                  onClick={() => {
                    // Note: "always allow" is stored by backend when proceed_always is confirmed
                    // 注意：后端会在确认 proceed_always 时自动存储权限
                    setConfirmations((prev) => prev.filter((p) => p.id !== confirmation.id));
                    void ipcBridge.conversation.confirmation.confirm.invoke({
                      conversation_id: confirmation.conversation_id,
                      callId: confirmation.callId,
                      msg_id: confirmation.id,
                      data: option.value,
                    });
                  }}
                  key={label + option.value + index}
                  className='b-1px b-solid h-30px lh-30px b-[var(--border-base)] rd-8px px-12px hover:bg-[var(--bg-hover)] cursor-pointer mt-10px flex items-center gap-8px color-[var(--text-primary)]'
                >
                  <span className='inline-flex items-center justify-center px-4px h-18px rd-4px bg-[var(--bg-2)] text-11px text-[var(--text-secondary)] font-mono shrink-0'>
                    {shortcut}
                  </span>
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
