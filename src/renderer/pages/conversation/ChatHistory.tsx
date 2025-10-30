/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { addEventListener, emitter } from '@/renderer/utils/emitter';
import { Empty, Popconfirm } from '@arco-design/web-react';
import { DeleteOne, MessageOne } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

const diffDay = (time1: number, time2: number) => {
  const date1 = new Date(time1);
  const date2 = new Date(time2);
  const ymd1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const ymd2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  const diff = Math.abs(ymd2.getTime() - ymd1.getTime());
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const useTimeline = () => {
  const { t } = useTranslation();
  const current = Date.now();
  let prevTime: number;
  const format = (time: number) => {
    if (diffDay(current, time) === 0) return t('conversation.history.today');
    if (diffDay(current, time) === 1) return t('conversation.history.yesterday');
    if (diffDay(current, time) < 7) return t('conversation.history.recent7Days');
    return t('conversation.history.earlier');
  };
  return (conversation: TChatConversation) => {
    const time = conversation.createTime;
    const formatStr = format(time);
    if (prevTime && formatStr === format(prevTime)) {
      prevTime = time;
      return '';
    }
    prevTime = time;
    return formatStr;
  };
};

const useScrollIntoView = (id: string) => {
  useEffect(() => {
    if (!id) return;
    const el = document.getElementById('c-' + id);
    if (!el) return;

    const findScrollParent = (node: HTMLElement | null): HTMLElement | null => {
      let p = node?.parentElement;
      while (p) {
        const style = window.getComputedStyle(p);
        const overflowY = style.overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') return p;
        p = p.parentElement;
      }
      return null;
    };

    const container = findScrollParent(el);

    const isOutOfView = (): boolean => {
      const elRect = el.getBoundingClientRect();
      if (!container) {
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        return elRect.top < 0 || elRect.bottom > viewportHeight;
      }
      const cRect = container.getBoundingClientRect();
      return elRect.top < cRect.top || elRect.bottom > cRect.bottom;
    };

    if (isOutOfView()) {
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }, [id]);
};

const ChatHistory: React.FC = () => {
  const [chatHistory, setChatHistory] = useState<TChatConversation[]>([]);
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useScrollIntoView(id);

  const handleSelect = (conversation: TChatConversation) => {
    // ipcBridge.conversation.createWithConversation.invoke({ conversation }).then(() => {
    Promise.resolve(navigate(`/conversation/${conversation.id}`)).catch((error) => {
      console.error('Navigation failed:', error);
    });
    // });
  };

  const isConversation = !!id;

  useEffect(() => {
    const refresh = () => {
      // Get conversations from database instead of file storage
      ipcBridge.database.getUserConversations
        .invoke({ page: 0, pageSize: 10000 })
        .then((history) => {
          if (history && Array.isArray(history) && history.length > 0) {
            const sortedHistory = history.sort((a, b) => (b.createTime - a.createTime < 0 ? -1 : 1));
            setChatHistory(sortedHistory);
          } else {
            setChatHistory([]);
          }
        })
        .catch((error) => {
          console.error('[ChatHistory] Failed to load conversations from database:', error);
          setChatHistory([]);
        });
    };
    refresh();
    return addEventListener('chat.history.refresh', refresh);
  }, [isConversation]);

  const handleRemoveConversation = (id: string) => {
    ipcBridge.conversation.remove
      .invoke({ id })
      .then((success) => {
        if (success) {
          // Trigger refresh to reload from database
          emitter.emit('chat.history.refresh');
          Promise.resolve(navigate('/')).catch((error) => {
            console.error('Navigation failed:', error);
          });
        }
      })
      .catch((error) => {
        console.error('Failed to remove conversation:', error);
      });
  };

  const formatTimeline = useTimeline();

  const renderConversation = (conversation: TChatConversation) => {
    const isSelected = id === conversation.id;
    return (
      <div
        key={conversation.id}
        id={'c-' + conversation.id}
        className={classNames('hover:bg-aou-1 px-12px py-8px rd-8px flex justify-start items-center group cursor-pointer relative overflow-hidden group shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px', {
          '!bg-aou-2 ': isSelected,
        })}
        onClick={handleSelect.bind(null, conversation)}
      >
        <MessageOne theme='outline' size='20' className='mt-2px ml-2px mr-8px flex' />
        <FlexFullContainer className='h-24px'>
          <div className='text-nowrap overflow-hidden inline-block w-full text-14px lh-24px whitespace-nowrap text-t-primary'>{conversation.name}</div>
        </FlexFullContainer>
        <div
          className={classNames('absolute right--15px top-0px h-full w-70px items-center justify-center hidden group-hover:flex !collapsed-hidden', {
            'bg-aou-2': isSelected,
            'bg-aou-1': !isSelected,
          })}
          style={{
            maskImage: 'linear-gradient(to right, transparent, black 50%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 50%)',
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <Popconfirm
            title={t('conversation.history.deleteTitle')}
            content={t('conversation.history.deleteConfirm')}
            okText={t('conversation.history.confirmDelete')}
            cancelText={t('conversation.history.cancelDelete')}
            onOk={(event) => {
              event.stopPropagation();
              handleRemoveConversation(conversation.id);
            }}
            onCancel={(event) => {
              event.stopPropagation();
            }}
          >
            <span
              className='flex-center'
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <DeleteOne theme='outline' size='20' className='flex' />
            </span>
          </Popconfirm>
        </div>
      </div>
    );
  };

  return (
    <FlexFullContainer>
      <div
        className={classNames('size-full', {
          'flex-center size-full': !chatHistory.length,
          'flex flex-col overflow-y-auto': !!chatHistory.length,
        })}
      >
        {!chatHistory.length ? (
          <Empty className={'collapsed-hidden'} description={t('conversation.history.noHistory')} />
        ) : (
          chatHistory.map((item) => {
            const timeline = formatTimeline(item);
            return (
              <React.Fragment key={item.id}>
                {timeline && <div className='collapsed-hidden px-12px py-8px text-13px text-t-secondary font-bold'>{timeline}</div>}
                {renderConversation(item)}
              </React.Fragment>
            );
          })
        )}
      </div>
    </FlexFullContainer>
  );
};

export default ChatHistory;
