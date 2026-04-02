import { ipcBridge } from '@/common';
import type { IConfirmation } from '@/common/chat/chatLib';
import { Divider, Typography } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { removeStack } from '@/renderer/utils/common';

type StoredConfirmation = IConfirmation<any> & { conversation_id: string };

/**
 * Global confirmation overlay for team mode.
 * Renders centered over the entire TeamPage using a portal.
 * The lead agent listens to all conversations and handles approvals centrally.
 */
const TeamConfirmOverlay: React.FC<{
  allConversationIds: string[];
}> = ({ allConversationIds }) => {
  const [confirmations, setConfirmations] = useState<StoredConfirmation[]>([]);
  const { t } = useTranslation();

  const idSet = useMemo(() => new Set(allConversationIds), [allConversationIds]);

  useEffect(() => {
    const loadConfirmations = async () => {
      const results = await Promise.allSettled(
        allConversationIds.map((cid) =>
          ipcBridge.conversation.confirmation.list
            .invoke({ conversation_id: cid })
            .then((data) => data.map((c) => ({ ...c, conversation_id: cid })))
            .catch(() => [] as StoredConfirmation[])
        )
      );
      const allData = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      setConfirmations(allData);
    };

    void loadConfirmations();

    return removeStack(
      ipcBridge.conversation.confirmation.add.on((data) => {
        if (!idSet.has(data.conversation_id)) return;
        setConfirmations((prev) => prev.concat({ ...data, conversation_id: data.conversation_id }));
      }),
      ipcBridge.conversation.confirmation.remove.on((data) => {
        if (!idSet.has(data.conversation_id)) return;
        setConfirmations((prev) => prev.filter((p) => p.id !== data.id));
      }),
      ipcBridge.conversation.confirmation.update.on((data) => {
        if (!idSet.has(data.conversation_id)) return;
        setConfirmations((list) => list.map((p) => (p.id === data.id ? { ...p, ...data } : p)));
      })
    );
  }, [allConversationIds, idSet]);

  // Keyboard shortcuts
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
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const options = confirmation.options;
      if (event.key === 'Enter') {
        event.preventDefault();
        if (options[0]) confirmOption(options[0]);
        return;
      }
      if (event.key === 'Escape' || event.key.toLowerCase() === 'n') {
        const cancelOpt = options.find((opt) => opt.value === 'cancel');
        if (cancelOpt) {
          event.preventDefault();
          confirmOption(cancelOpt);
        }
        return;
      }
      if (event.key.toLowerCase() === 'y') {
        const allowOpt = options.find((opt) => opt.value === 'proceed_once');
        if (allowOpt) {
          event.preventDefault();
          confirmOption(allowOpt);
        }
        return;
      }
      if (event.key.toLowerCase() === 'a') {
        const alwaysOpt = options.find((opt) => opt.value === 'proceed_always');
        if (alwaysOpt) {
          event.preventDefault();
          confirmOption(alwaysOpt);
        }
        return;
      }
      const num = parseInt(event.key, 10);
      if (num >= 1 && num <= options.length) {
        event.preventDefault();
        confirmOption(options[num - 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmations]);

  if (!confirmations.length) return null;

  const confirmation = confirmations[0];
  const $t = (key: string, params?: Record<string, string>) => t(key, { ...params, defaultValue: key });

  return createPortal(
    <div
      className='fixed inset-0 flex items-end justify-center pb-24px'
      style={{ zIndex: 1000, pointerEvents: 'none' }}
    >
      <div
        className='relative p-16px bg-white flex flex-col overflow-hidden rd-20px max-w-800px max-h-[calc(100vh-200px)] w-full box-border mx-20px'
        style={{
          boxShadow: '0px 2px 20px 0px rgba(74, 88, 250, 0.1)',
          pointerEvents: 'auto',
        }}
      >
        <div className='flex-1 overflow-y-auto min-h-0'>
          <Typography.Ellipsis className='text-16px font-bold color-[rgba(29,33,41,1)]' rows={2} expandable>
            {$t(confirmation.title) || 'Choose an action'}
          </Typography.Ellipsis>
          <Divider className={'!my-10px'} />
          <Typography.Ellipsis className='text-14px color-[rgba(29,33,41,1)]' rows={5} expandable>
            {$t(confirmation.description)}
          </Typography.Ellipsis>
        </div>
        <div className='shrink-0'>
          {confirmation.options.map((option, index) => {
            const label = $t(option.label, option.params);
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
                  setConfirmations((prev) => prev.filter((p) => p.id !== confirmation.id));
                  void ipcBridge.conversation.confirmation.confirm.invoke({
                    conversation_id: confirmation.conversation_id,
                    callId: confirmation.callId,
                    msg_id: confirmation.id,
                    data: option.value,
                  });
                }}
                key={label + option.value + index}
                className='b-1px b-solid h-30px lh-30px b-[rgba(229,230,235,1)] rd-8px px-12px hover:bg-[rgba(229,231,240,1)] cursor-pointer mt-10px flex items-center gap-8px'
              >
                <span className='inline-flex items-center justify-center px-4px h-18px rd-4px bg-[rgba(229,230,235,0.6)] text-11px text-[rgba(134,144,156,1)] font-mono shrink-0'>
                  {shortcut}
                </span>
                {label}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TeamConfirmOverlay;
