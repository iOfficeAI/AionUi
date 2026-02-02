import { ipcBridge } from '@/common';
import type { IConfirmation } from '@/common/chatLib';
import { Divider, Typography } from '@arco-design/web-react';
import type { PropsWithChildren } from 'react';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { removeStack } from '../../../utils/common';

// localStorage key prefix for storing "always" permission choices
const PERMISSION_STORAGE_PREFIX = 'codex_global_permission_choice_';

// Check if option is an "always" type
const isAlwaysOption = (value: string): boolean => {
  return value === 'allow_always' || value === 'reject_always';
};

// Get stored "always" choice for a permission action type
const getStoredAlwaysChoice = (action: string | undefined): string | null => {
  if (!action) return null;
  try {
    const stored = localStorage.getItem(`${PERMISSION_STORAGE_PREFIX}${action}`);
    if (stored && isAlwaysOption(stored)) {
      return stored;
    }
  } catch {
    // localStorage error
  }
  return null;
};

// Store "always" choice for a permission action type
const storeAlwaysChoice = (action: string | undefined, value: string): void => {
  if (!action || !isAlwaysOption(value)) return;
  try {
    localStorage.setItem(`${PERMISSION_STORAGE_PREFIX}${action}`, value);
    localStorage.setItem(`${PERMISSION_STORAGE_PREFIX}${action}_timestamp`, Date.now().toString());
  } catch {
    // localStorage error
  }
};
const ConversationChatConfirm: React.FC<PropsWithChildren<{ conversation_id: string }>> = ({ conversation_id, children }) => {
  const [confirmations, setConfirmations] = useState<IConfirmation<any>[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { t } = useTranslation();

  // Track which confirmations have been auto-handled to prevent duplicate processing
  const autoHandledRef = useRef<Set<string>>(new Set());

  // Handle confirmation (both manual and auto)
  const handleConfirm = useCallback(
    (confirmation: IConfirmation<any>, optionValue: string) => {
      // Store "always" choice if applicable
      storeAlwaysChoice(confirmation.action, optionValue);

      // Remove from local state
      setConfirmations((prev) => prev.filter((p) => p.id !== confirmation.id));

      // Send confirmation to backend
      void ipcBridge.conversation.confirmation.confirm.invoke({
        conversation_id,
        callId: confirmation.callId,
        msg_id: confirmation.id,
        data: optionValue,
      });
    },
    [conversation_id]
  );

  // Auto-handle confirmations that have stored "always" choices
  useEffect(() => {
    if (!confirmations.length) return;

    const confirmation = confirmations[0];

    // Skip if already auto-handled
    if (autoHandledRef.current.has(confirmation.id)) return;

    // Check for stored "always" choice
    const storedChoice = getStoredAlwaysChoice(confirmation.action);
    if (storedChoice) {
      // Verify the stored choice is a valid option
      const validOption = confirmation.options.find((opt) => opt.value === storedChoice);
      if (validOption) {
        // Mark as handled to prevent duplicate processing
        autoHandledRef.current.add(confirmation.id);
        // Auto-confirm with stored choice
        handleConfirm(confirmation, storedChoice);
      }
    }
  }, [confirmations, handleConfirm]);

  useEffect(() => {
    // 修复 #475: 添加错误处理和重试机制
    // Fix #475: Add error handling and retry mechanism
    let retryCount = 0;
    const maxRetries = 3; // 最大重试次数 / Maximum retry attempts

    const loadConfirmations = () => {
      void ipcBridge.conversation.confirmation.list
        .invoke({ conversation_id })
        .then((data) => {
          setConfirmations(data);
          setLoadError(null); // 加载成功，清除错误状态 / Load success, clear error state
        })
        .catch((error) => {
          console.error('[ConversationChatConfirm] Failed to load confirmations:', error);
          // 自动重试机制：未达到最大重试次数时，1秒后重试
          // Auto retry mechanism: retry after 1 second if max retries not reached
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(loadConfirmations, 1000);
          } else {
            // 重试次数耗尽，显示错误状态
            // Retries exhausted, show error state
            setLoadError(error?.message || 'Failed to load confirmations');
          }
        });
    };

    loadConfirmations();

    return removeStack(
      ipcBridge.conversation.confirmation.add.on((data) => {
        if (conversation_id !== data.conversation_id) return;
        setConfirmations((prev) => prev.concat(data));
        // 新确认对话框成功加载时，清除之前的错误状态
        // Clear previous error state when new confirmation loads successfully
        setLoadError(null);
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
  }, [conversation_id]);

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
          handleConfirm(confirmation, cancelOption.value);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [confirmations, handleConfirm]);
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
                .catch((error) => setLoadError(error?.message || 'Failed to load'));
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

  if (!confirmations.length) return <>{children}</>;
  const confirmation = confirmations[0];
  const $t = (key: string, params?: Record<string, string>) => t(key, { ...params, defaultValue: key });
  return (
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
            <div onClick={() => handleConfirm(confirmation, option.value)} key={label + option.value + index} className='b-1px b-solid h-30px lh-30px b-[rgba(229,230,235,1)] rd-8px px-12px hover:bg-[rgba(229,231,240,1)] cursor-pointer mt-10px'>
              {label}
            </div>
          );
        })}
      </div>
      <div className='hidden'>{children}</div>
    </div>
  );
};

export default ConversationChatConfirm;
