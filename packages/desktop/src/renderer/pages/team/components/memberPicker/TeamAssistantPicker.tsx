import React, { useMemo, useState } from 'react';
import { Button, Empty, Input, Tooltip } from '@arco-design/web-react';
import { Plus, Search } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { AssistantOptionLabel, assistantKey, type TeamAssistantOption } from '../assistantSelectUtils';

type Props = {
  assistants: TeamAssistantOption[];
  onSelect: (assistant: TeamAssistantOption) => void;
  disabled?: boolean;
  pendingAssistantId?: string;
  testIdPrefix?: string;
};

const TeamAssistantPicker: React.FC<Props> = ({
  assistants,
  onSelect,
  disabled = false,
  pendingAssistantId,
  testIdPrefix = 'team-assistant-picker',
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const filteredAssistants = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assistants;
    return assistants.filter((assistant) => assistant.name.toLowerCase().includes(q));
  }, [assistants, query]);

  return (
    <div className='flex flex-col gap-8px'>
      <Input
        prefix={<Search size='14' fill='currentColor' />}
        value={query}
        onChange={setQuery}
        placeholder={t('team.create.searchPlaceholder', { defaultValue: 'Search assistants...' })}
        data-testid={`${testIdPrefix}-search`}
      />
      <div className='max-h-320px overflow-y-auto rounded-8px border border-border-2 bg-fill-1 p-6px'>
        {filteredAssistants.length === 0 ? (
          <Empty description={t('team.create.noSearchResults', { defaultValue: 'No results found' })} />
        ) : (
          <div className='flex flex-col gap-6px'>
            {filteredAssistants.map((assistant, index) => {
              const rowKey = `${assistantKey(assistant)}-${index}`;
              const rowDisabled = disabled || assistant.team_selectable === false;
              const blockReason =
                assistant.team_selectable === false
                  ? t('settings.assistantTeamUnsupported', {
                      defaultValue: 'This assistant cannot be used in team mode right now.',
                    })
                  : undefined;
              const row = (
                <Button
                  long
                  type='text'
                  disabled={rowDisabled}
                  loading={pendingAssistantId === assistant.id}
                  className='!h-auto !justify-start !px-10px !py-8px'
                  icon={<Plus theme='outline' size='14' />}
                  onClick={() => onSelect(assistant)}
                  data-testid={`${testIdPrefix}-option-${assistantKey(assistant)}`}
                >
                  <div className='min-w-0 flex flex-col items-start'>
                    <AssistantOptionLabel assistant={assistant} />
                    {blockReason ? <span className='mt-2px text-11px text-t-tertiary'>{blockReason}</span> : null}
                  </div>
                </Button>
              );
              return <div key={rowKey}>{blockReason ? <Tooltip content={blockReason}>{row}</Tooltip> : row}</div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamAssistantPicker;
