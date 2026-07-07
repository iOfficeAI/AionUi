import React from 'react';

type SectionCardProps = {
  title: string;
  legend?: { label: string; tone: 'now' | 'next' };
  readOnly?: boolean;
  readOnlyLabel?: string;
  extra?: React.ReactNode;
  testId?: string;
  children: React.ReactNode;
};

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  legend,
  readOnly,
  readOnlyLabel,
  extra,
  testId,
  children,
}) => {
  return (
    <section
      data-testid={testId}
      className='rounded-12px border border-border-2 bg-2 px-[12px] py-[16px] md:rounded-16px md:px-[24px] md:py-[20px]'
    >
      <div className='mb-12px flex items-center gap-8px'>
        <div className='text-14px font-500 text-t-primary'>{title}</div>
        {legend ? (
          <span
            className={`rounded-6px px-8px py-2px text-10px font-500 ${
              legend.tone === 'now'
                ? 'border border-success-8 bg-success-8 text-white font-600'
                : 'border border-warning-8 bg-warning-8 text-white font-600'
            }`}
          >
            {legend.label}
          </span>
        ) : null}
        {readOnly && readOnlyLabel ? (
          <span className='ml-auto rounded-8px bg-fill-1 px-8px py-3px text-10px font-500 text-t-tertiary'>
            {readOnlyLabel}
          </span>
        ) : null}
        {extra ? <div className='ml-auto'>{extra}</div> : null}
      </div>
      {children}
    </section>
  );
};

export const FieldLabel: React.FC<{ children: React.ReactNode; required?: boolean; icon?: React.ReactNode }> = ({
  children,
  required = false,
  icon,
}) => {
  return (
    <div className='w-86px flex-shrink-0 pt-6px text-13px leading-20px text-t-secondary'>
      <span className='flex items-center gap-6px leading-none'>
        {required ? <span className='text-[rgb(var(--danger-6))]'>*</span> : null}
        {icon ? <span className='inline-flex shrink-0 items-center text-t-tertiary'>{icon}</span> : null}
        <span>{children}</span>
      </span>
    </div>
  );
};

type ConfigRowProps = {
  label: React.ReactNode;
  children: React.ReactNode;
  hint?: React.ReactNode;
  /** Optional leading icon shown before the label text. */
  icon?: React.ReactNode;
};

export const ConfigRow: React.FC<ConfigRowProps> = ({ label, children, hint, icon }) => {
  return (
    <div className='flex items-start gap-12px'>
      <FieldLabel icon={icon}>{label}</FieldLabel>
      <div className='min-w-0 flex-1 space-y-8px'>
        {children}
        {hint ? <div className='text-11px leading-18px text-t-tertiary'>{hint}</div> : null}
      </div>
    </div>
  );
};

export const ReadonlySelectionField: React.FC<{ value: string }> = ({ value }) => {
  return (
    <div className='min-h-32px rounded-8px border border-border-2 bg-fill-1 px-12px py-8px text-13px leading-20px text-t-secondary'>
      {value}
    </div>
  );
};
