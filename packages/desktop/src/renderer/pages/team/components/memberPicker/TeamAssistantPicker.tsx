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
              const rowBlocked = assistant.team_selectable === false;
              const rowDisabled = disabled || rowBlocked;
              const blockReason = rowBlocked
                ? assistant.team_block_reason ||
                  t('settings.assistantTeamUnsupported', {
                    defaultValue: 'This assistant cannot be used in team mode right now.',
                  })
                : undefined;
              const rowBaseClassName = isModalDensity
                ? '!h-44px !justify-start !rounded-8px !px-8px !py-0'
                : '!h-48px !justify-start !rounded-8px !px-6px !py-0';
              const rowStateClassName = rowDisabled
                ? '!cursor-not-allowed !text-t-tertiary hover:!bg-transparent'
                : 'hover:!bg-fill-2';
              const rowClassName = `w-full ${rowBaseClassName} ${rowStateClassName}`;
              const rowContentClassName = `flex min-w-0 w-full flex-1 items-center justify-between gap-12px ${
                rowDisabled ? 'cursor-not-allowed text-t-tertiary' : ''
              }`;
              const addIconBoxClassName = isModalDensity ? 'h-30px w-30px' : 'h-32px w-32px';
              const addIcon = (
                <span
                  className={`flex ${addIconBoxClassName} shrink-0 items-center justify-center ${
                    rowDisabled ? 'text-t-quaternary' : 'text-t-secondary'
                  }`}
                  data-testid='team-assistant-picker-add-icon'
                >
                  <Plus theme='outline' size={isModalDensity ? '16' : '14'} fill='currentColor' />
                </span>
              );
              const row = blockReason ? (
                <Button
                  long
                  type='text'
                  className={rowClassName}
                  aria-disabled='true'
                  tabIndex={-1}
                  data-testid={`${testIdPrefix}-option-${assistantKey(assistant)}`}
                >
                  <div className={rowContentClassName} data-testid='team-assistant-picker-row-content'>
                    <div
                      className='min-w-0 flex flex-1 flex-col items-start overflow-hidden'
                      data-testid='team-assistant-picker-text'
                    >
                      <AssistantOptionLabel assistant={assistant} size={isModalDensity ? 'large' : 'compact'} muted />
                    </div>
                    {addIcon}
                  </div>
                </Button>
              ) : (
                <Button
                  long
                  type='text'
                  disabled={disabled}
                  loading={pendingAssistantId === assistant.id}
                  className={rowClassName}
                  onClick={() => onSelect(assistant)}
                  data-testid={`${testIdPrefix}-option-${assistantKey(assistant)}`}
                >
                  <div className={rowContentClassName} data-testid='team-assistant-picker-row-content'>
                    <div
                      className='min-w-0 flex flex-1 flex-col items-start overflow-hidden'
                      data-testid='team-assistant-picker-text'
                    >
                      <AssistantOptionLabel
                        assistant={assistant}
                        size={isModalDensity ? 'large' : 'compact'}
                        muted={disabled}
                      />
                    </div>
                    {addIcon}
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
