/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';
import { ChatStorage } from '@/common/storage';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { Dropdown, Empty, Input, Menu, Message, Modal } from '@arco-design/web-react';
import { MessageOne, More } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { mutate } from 'swr';

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

const ChatHistory: React.FC = () => {
  const [chatHistory, setChatHistory] = useState<TChatConversation[]>([]);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameInputValue, setRenameInputValue] = useState('');
  const [currentConversation, setCurrentConversation] = useState<TChatConversation | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [message, messageContext] = Message.useMessage({
    duration: 1500, // 设置为1.5秒
  });

  /**
   * 重置重命名相关的状态
   */
  const resetRenameState = () => {
    setRenameModalVisible(false);
    setCurrentConversation(null);
    setRenameInputValue('');
  };

  /**
   * 重置删除相关的状态
   */
  const resetDeleteState = () => {
    setDeleteModalVisible(false);
    setDeleteTargetId(null);
  };

  const handleSelect = (conversation: TChatConversation) => {
    ipcBridge.conversation.create.invoke({
      type: 'gemini',
      model: conversation.model,
      extra: { workspace: conversation.extra.workspace },
    });
    navigate(`/conversation/${conversation.id}`);
  };

  const isConversation = !!id;

  useEffect(() => {
    ChatStorage.get('chat.history').then((history) => {
      if (history) {
        setChatHistory(history.sort((a, b) => (b.createTime - a.createTime < 0 ? -1 : 1)));
      }
    });
  }, [isConversation]);

  /**
   * 处理删除会话操作
   * 1. 调用IPC接口删除会话
   * 2. 更新本地状态
   * 3. 重置删除相关状态
   * 4. 显示操作结果提示
   * 5. 删除成功后跳转到首页
   */
  const handleRemoveConversation = (id: string) => {
    ipcBridge.conversation.remove.invoke({ id }).then((success) => {
      if (success) {
        setChatHistory(chatHistory.filter((item) => item.id !== id));
        // 删除成功后重置状态并跳转
        resetDeleteState();
        // 显示删除成功提示
        message.success(t('messages.deleteSuccess'));
        navigate('/');
      } else {
        // 删除失败时显示错误提示
        message.error(t('messages.deleteFailed'));
        // 删除失败时也需要重置状态
        resetDeleteState();
      }
    }).catch((error) => {
      // 处理IPC调用异常
      console.error('删除操作异常:', error);
      message.error(t('messages.deleteFailed'));
      resetDeleteState();
    });
  };

  const handleRenameConversation = (conversation: TChatConversation) => {
    setCurrentConversation(conversation);
    setRenameInputValue(conversation.name);
    setRenameModalVisible(true);
  };

  /**
   * 处理重命名确认操作
   * 1. 调用IPC接口重命名会话
   * 2. 更新本地状态
   * 3. 同步更新顶部标题（如果当前正在查看该会话）
   * 4. 显示操作结果提示
   */
  const handleRenameConfirm = async () => {
    if (!currentConversation || !renameInputValue.trim()) return;
    
    try {
      const success = await ipcBridge.conversation.rename.invoke({
        id: currentConversation.id,
        name: renameInputValue.trim()
      });
      
      if (success) {
        setChatHistory(prev => prev.map(item => 
          item.id === currentConversation.id 
            ? { ...item, name: renameInputValue.trim() }
            : item
        ));
        resetRenameState();
        // 显示重命名成功提示
        message.success(t('messages.renameSuccess'));
        
        // 如果当前正在查看这个会话，同步更新顶部标题
        if (id === currentConversation.id) {
          // 重新验证当前会话的数据，更新顶部标题
          // 注意：这里使用 mutate 是为了确保 ChatConversation 组件能获取到最新的会话名称
          // 虽然我们已经在本地更新了 chatHistory，但顶部标题来自父组件的 conversation props
          mutate(`conversation/${id}`);
        }
      } else {
        // 显示重命名失败提示
        message.error(t('messages.renameFailed'));
      }
    } catch (error) {
      // 处理IPC调用异常
      console.error('重命名操作异常:', error);
      message.error(t('messages.renameFailed'));
    }
  };

  const handleRenameCancel = resetRenameState;

  const formatTimeline = useTimeline();

  const renderConversation = (conversation: TChatConversation) => {
    const isSelected = id === conversation.id;
    
    const menu = (
      <Menu>
        <Menu.Item key="rename" onClick={() => handleRenameConversation(conversation)}>
          {t('conversation.history.rename')}
        </Menu.Item>
        <Menu.Item key="delete" onClick={() => {
          setDeleteTargetId(conversation.id);
          setDeleteModalVisible(true);
        }}>
          <span className="text-red-500 hover:text-red-600 transition-colors duration-200">
            {t('common.delete')}
          </span>
        </Menu.Item>
      </Menu>
    );

    return (
      <div
        key={conversation.id}
        id={'c-' + conversation.id}
        className={classNames('hover:bg-#EBECF1 px-12px py-8px rd-8px flex justify-start items-center group cursor-pointer relative overflow-hidden group shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px', {
          '!bg-#E5E7F0 ': isSelected,
        })}
        onClick={handleSelect.bind(null, conversation)}
      >
        <MessageOne theme='outline' size='20' className='mt-2px ml-2px mr-8px flex' />
        <FlexFullContainer className='h-24px'>
          <div className='text-nowrap overflow-hidden inline-block w-full text-14px lh-24px  whitespace-nowrap'>{conversation.name}</div>
        </FlexFullContainer>
        <div
          className={classNames('absolute right--15px top-0px h-full w-70px items-center justify-center hidden group-hover:flex !collapsed-hidden')}
          style={{
            backgroundImage: `linear-gradient(to right, rgba(219, 234, 254, 0),${isSelected ? '#E5E7F0' : '#E5E7F0'} 50%)`,
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <Dropdown droplist={menu} trigger="click" position="bottom">
            <span className='flex-center cursor-pointer'>
              <More theme='outline' size='20' className='flex' />
            </span>
          </Dropdown>
        </div>
      </div>
    );
  };
  return (
    <FlexFullContainer>
      {messageContext}
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
                {timeline && <div className='collapsed-hidden px-12px py-8px text-13px color-#555 font-bold'>{timeline}</div>}
                {renderConversation(item)}
              </React.Fragment>
            );
          })
        )}
      </div>
      
      {/* 重命名模态框 */}
      <Modal
        title={t('conversation.history.renameTitle')}
        visible={renameModalVisible}
        onOk={handleRenameConfirm}
        onCancel={handleRenameCancel}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Input
          value={renameInputValue}
          onChange={setRenameInputValue}
          placeholder={t('conversation.history.renamePlaceholder')}
          onPressEnter={handleRenameConfirm}
        />
      </Modal>

      {/* 删除确认模态框 */}
      <Modal
        title={t('conversation.history.deleteTitle')}
        visible={deleteModalVisible}
        onOk={() => {
          if (deleteTargetId) {
            handleRemoveConversation(deleteTargetId);
          }
        }}
        onCancel={() => {
          resetDeleteState();
        }}
        okText={t('common.delete')}
        cancelText={t('common.cancel')}
      >
        <p>{t('conversation.history.deleteConfirm')}</p>
      </Modal>
    </FlexFullContainer>
  );
};

export default ChatHistory;
