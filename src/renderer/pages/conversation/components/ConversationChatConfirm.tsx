import { ipcBridge } from '@/common';
import type { IConfirmation } from '@/common/chatLib';
import { Divider } from '@arco-design/web-react';
import type { PropsWithChildren } from 'react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { removeStack } from '../../../utils/common';
const ConversationChatConfirm: React.FC<PropsWithChildren<{ conversation_id: string }>> = ({ conversation_id, children }) => {
  const [confirmations, setConfirmations] = useState<IConfirmation<any>[]>([]);
  const { t } = useTranslation();
  useEffect(() => {
    void ipcBridge.conversation.confirmation.list.invoke({ conversation_id }).then((data) => {
      setConfirmations(data);
    });
    return removeStack(
      ipcBridge.conversation.confirmation.add.on((data) => {
        if (conversation_id !== data.conversation_id) return;
        setConfirmations((prev) => prev.concat(data));
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
  if (!confirmations.length) return <>{children}</>;
  const confirmation = confirmations[0];
  const $t = (key: string) => t(key, key);
  return (
    <div
      className={`relative p-16px  bg-white flex flex-col overflow-hidden m-b-20px rd-20px max-w-800px w-full mx-auto box-border`}
      style={{
        boxShadow: '0px 2px 20px 0px rgba(74, 88, 250, 0.1)',
      }}
    >
      <div className='color-[rgba(29,33,41,1)] text-16px font-bold'>{$t(confirmation.title) || 'Choose an action'}:</div>
      <Divider className={'!my-10px'}></Divider>
      <div className='text-14px color-[rgba(29,33,41,1)]'>
        <div>{$t(confirmation.description)}</div>
      </div>
      {confirmation.options.map((option, index) => {
        const label = $t(option.label);
        return (
          <div
            onClick={() => {
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
  );
};

export default ConversationChatConfirm;
