/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Close, PreviewOpen } from '@icon-park/react';
import { Checkbox, Empty, Tooltip } from '@arco-design/web-react';
import type { PickedElement } from './types';

interface BasketProps {
  items: PickedElement[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onHighlight: (selector: string) => void;
  onClear: () => void;
  onSend: () => void;
  onCopy: () => void;
  byteEstimate: number;
  byteLimit: number;
  /** When true, the Send button label says "send to the current chat" (round-trip mode) instead of "new chat". */
  sendToCurrentChat: boolean;
}

function describe(el: PickedElement): string {
  const id = el.attrs.id ? '#' + el.attrs.id : '';
  const cls = el.attrs.class ? '.' + el.attrs.class.split(/\s+/).slice(0, 2).join('.') : '';
  return `<${el.tagName}${id}${cls}>`;
}

const Basket: React.FC<BasketProps> = ({
  items,
  selectedIds,
  onToggle,
  onRemove,
  onHighlight,
  onClear,
  onSend,
  onCopy,
  byteEstimate,
  byteLimit,
  sendToCurrentChat,
}) => {
  const { t } = useTranslation();
  const overBudget = byteEstimate > byteLimit;

  return (
    <div className='h-full w-320px flex flex-col border-l border-border-1 bg-bg-2'>
      <div className='flex items-center justify-between px-12px h-40px border-b border-border-1 flex-shrink-0'>
        <span className='text-13px font-medium'>
          {t('conversation.devBrowser.basketTitle', { count: items.length })}
        </span>
        <button
          type='button'
          onClick={onClear}
          disabled={items.length === 0}
          className='text-12px text-t-secondary disabled:opacity-40 hover:text-t-primary cursor-pointer disabled:cursor-not-allowed bg-transparent border-0'
        >
          {t('conversation.devBrowser.clearAll')}
        </button>
      </div>

      <div className='flex-1 overflow-y-auto'>
        {items.length === 0 ? (
          <div className='h-full flex items-center justify-center'>
            <Empty description={t('conversation.devBrowser.basketEmpty')} />
          </div>
        ) : (
          <ul className='m-0 p-0 list-none'>
            {items.map((el) => (
              <li
                key={el.id}
                className='px-12px py-10px border-b border-border-1 flex items-start gap-8px hover:bg-fill-2'
              >
                <Checkbox checked={selectedIds.has(el.id)} onChange={() => onToggle(el.id)} />
                <div className='flex-1 min-w-0'>
                  <div className='text-12px font-mono text-t-primary truncate'>{describe(el)}</div>
                  {el.textContent && <div className='text-12px text-t-secondary truncate mt-2px'>{el.textContent}</div>}
                  <div className='text-11px text-t-tertiary truncate mt-2px'>{el.title || el.url}</div>
                </div>
                <div className='flex flex-col gap-4px'>
                  <Tooltip content={t('conversation.devBrowser.highlight')}>
                    <button
                      type='button'
                      onClick={() => onHighlight(el.selector)}
                      className='bg-transparent border-0 cursor-pointer p-2px text-t-secondary hover:text-primary-6'
                      aria-label='highlight'
                    >
                      <PreviewOpen theme='outline' size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip content={t('conversation.devBrowser.remove')}>
                    <button
                      type='button'
                      onClick={() => onRemove(el.id)}
                      className='bg-transparent border-0 cursor-pointer p-2px text-t-secondary hover:text-danger-6'
                      aria-label='remove'
                    >
                      <Close theme='outline' size={14} />
                    </button>
                  </Tooltip>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className='border-t border-border-1 p-10px flex-shrink-0 flex flex-col gap-6px'>
        <div className={`text-11px ${overBudget ? 'text-danger-6' : 'text-t-tertiary'}`}>
          {t('conversation.devBrowser.payloadSize', {
            current: (byteEstimate / 1024).toFixed(1),
            limit: (byteLimit / 1024).toFixed(0),
          })}
        </div>
        <button
          type='button'
          onClick={onSend}
          disabled={selectedIds.size === 0 || overBudget}
          className='h-32px rounded-6px bg-primary-6 text-white text-12px font-medium border-0 cursor-pointer disabled:bg-fill-3 disabled:text-t-tertiary disabled:cursor-not-allowed hover:bg-primary-7'
        >
          {t(sendToCurrentChat ? 'conversation.devBrowser.sendToCurrentChat' : 'conversation.devBrowser.sendToChat', {
            count: selectedIds.size,
          })}
        </button>
        <button
          type='button'
          onClick={onCopy}
          disabled={selectedIds.size === 0}
          className='h-28px rounded-6px bg-transparent text-t-secondary text-12px border border-border-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-fill-2'
        >
          {t('conversation.devBrowser.copyToClipboard')}
        </button>
      </div>
    </div>
  );
};

export default Basket;
