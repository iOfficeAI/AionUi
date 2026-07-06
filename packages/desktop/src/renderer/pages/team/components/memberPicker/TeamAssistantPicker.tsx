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
  density?: 'compact' | 'modal';
  className?: string;
};

const TeamAssistantPicker: React.FC<Props> = ({
  assistants,
  onSelect,
  disabled = false,
  pendingAssistantId,
  testIdPrefix = 'team-assistant-picker',
  density = 'compact',
  className,
}) => {
  const { t } = useTranslation();
  const isModalDensity = density === 'modal';
  const [query, setQuery] = useState('');
  const filteredAssistants = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assistants;
    return assistants.filter((assistant) => assistant.name.toLowerCase().includes(q));
  }, [assistants, query]);

  return (
    <div className={`flex min-h-0 flex-col ${isModalDensity ? 'gap-12px' : 'gap-8px'} ${className ?? ''}`}>
      <Input
        prefix={<Search size='14' fill='currentColor' />}
        value={query}
        onChange={setQuery}
        placeholder={t('team.create.searchPlaceholder', { defaultValue: 'Search assistants...' })}
        data-testid={`${testIdPrefix}-search`}
        className={isModalDensity ? '!h-40px !rounded-8px !text-14px' : undefined}
      />
      <div
        className={
          isModalDensity
            ? 'min-h-0 flex-1 overflow-y-auto rounded-8px bg-fill-1 p-8px'
            : 'max-h-320px overflow-y-auto rounded-8px border border-border-2 bg-fill-1 p-6px'
        }
      >
        {filteredAssistants.length === 0 ? (
          <Empty description={t('team.create.noSearchResults', { defaultValue: 'No results found' })} />
        ) : (
          <div className={isModalDensity ? 'flex flex-col gap-6px' : 'flex flex-col gap-6px'}>
            {filteredAssistants.map((assistant, index) => {
              const rowKey = `${assistantKey(assistant)}-${index}`;
              const rowDisabled = disabled || assistant.team_selectable === false;
              const blockReason =
                assistant.team_selectable === false
                  ? assistant.team_block_reason ||
                    t('settings.assistantTeamUnsupported', {
                      defaultValue: 'This assistant cannot be used in team mode right now.',
                    })
                  : undefined;
              const row = (
                <Button
                  long
                  type='text'
                  disabled={rowDisabled}
                  loading={pendingAssistantId === assistant.id}
                  className={
                    isModalDensity
                      ? '!h-48px !justify-start !rounded-8px !px-10px !py-0'
                      : '!h-auto !justify-start !px-10px !py-8px'
                  }
                  onClick={() => onSelect(assistant)}
                  data-testid={`${testIdPrefix}-option-${assistantKey(assistant)}`}
                >
                  <div className='flex min-w-0 flex-1 items-center justify-between gap-12px'>
                    <div className='min-w-0 flex flex-col items-start'>
                      <AssistantOptionLabel assistant={assistant} size={isModalDensity ? 'large' : 'compact'} />
                      {blockReason ? <span className='mt-2px text-11px text-t-tertiary'>{blockReason}</span> : null}
                    </div>
                    <Plus
                      theme='outline'
                      size={isModalDensity ? '16' : '14'}
                      fill='currentColor'
                      className='shrink-0 text-t-secondary'
                    />
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
