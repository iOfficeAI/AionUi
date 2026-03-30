import { Button, Input } from '@arco-design/web-react';
import { Send } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
};

const TeamSendBox: React.FC<Props> = ({ onSend, disabled }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    const content = value.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await onSend(content);
      setValue('');
    } finally {
      setSending(false);
    }
  }, [value, sending, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className='flex gap-8px items-end border-t border-[var(--bg-3)] px-16px py-12px shrink-0'>
      <Input.TextArea
        value={value}
        onChange={setValue}
        onKeyDown={handleKeyDown}
        autoSize={{ minRows: 1, maxRows: 6 }}
        disabled={disabled || sending}
        placeholder={t('team.sendBox.placeholder')}
        className='flex-1'
      />
      <Button
        type='primary'
        icon={<Send size={16} />}
        loading={sending}
        disabled={!value.trim() || disabled}
        onClick={() => void handleSend()}
      />
    </div>
  );
};

export default TeamSendBox;
