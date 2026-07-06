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
  footer?: React.ReactNode;
};

const TeamAssistantPicker: React.FC<Props> = ({
  assistants,
  onSelect,
  disabled = false,
  pendingAssistantId,
  testIdPrefix = 'team-assistant-picker',
  density = 'compact',
  className,
  footer,
}) => {
  const { t } = useTranslation();
  const isModalDensity = density === 'modal';
  const [query, setQuery] = useState('');
  const searchPlaceholder = t('team.create.searchPlaceholder', { defaultValue: 'Search assistants...' });
  const filteredAssistants = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assistants;
    return assistants.filter((assistant) => assistant.name.toLowerCase().includes(q));
  }, [assistants, query]);

  return (
    <div className={`flex min-h-0 flex-col ${isModalDensity ? 'gap-12px' : ''} ${className ?? ''}`}>
      <div
        className={isModalDensity ? undefined : 'border-b border-border-1 bg-dialog-fill-0 px-14px'}
        data-testid={`${testIdPrefix}-search-shell`}
      >
        {isModalDensity ? (
          <Input
            prefix={<Search size='14' fill='currentColor' />}
            value={query}
            onChange={setQuery}
            placeholder={searchPlaceholder}
            data-testid={`${testIdPrefix}-search`}
            className='!h-38px !rounded-8px !text-13px'
          />
        ) : (
          <div className='flex h-50px items-center gap-10px text-t-secondary'>
            <Search size='16' fill='currentColor' className='shrink-0' />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              data-testid={`${testIdPrefix}-search`}
              className='min-w-0 flex-1 border-0 bg-transparent p-0 text-14px leading-20px text-t-primary outline-none placeholder:text-t-tertiary'
            />
          </div>
        )}
      </div>
      <div
        data-testid={`${testIdPrefix}-picker-body`}
        className={
          isModalDensity
            ? 'min-h-0 flex-1 overflow-y-auto rounded-8px bg-dialog-fill-0'
            : 'max-h-300px overflow-y-auto border-b border-border-1 bg-dialog-fill-0 px-8px py-10px'
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
                      ? '!h-44px !justify-start !rounded-8px !px-8px !py-0 hover:!bg-fill-2'
                      : '!h-48px !justify-start !rounded-8px !px-6px !py-0 hover:!bg-fill-2'
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
      {footer ? (
        <div
          className='bg-dialog-fill-0 px-14px py-10px text-12px font-600 leading-18px text-t-tertiary'
          data-testid={`${testIdPrefix}-footer`}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
};

export default TeamAssistantPicker;
