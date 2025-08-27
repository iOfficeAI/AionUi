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
  
  // 统一的状态管理
  const [modalState, setModalState] = useState<{
    type: 'rename' | 'delete' | null;
    conversation: TChatConversation | null;
    inputValue: string;
  }>({
    type: null,
    conversation: null,
    inputValue: ''
  });
  
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [message, messageContext] = Message.useMessage({
    duration: 1500, // 设置为1.5秒
  });

  /**
   * 重置模态框状态
   */
  const resetModalState = () => {
    setModalState({
      type: null,
      conversation: null,
      inputValue: ''
    });
  };

  /**
   * 打开模态框
   */
  const openModal = (type: 'rename' | 'delete', conversation: TChatConversation) => {
    setModalState({
      type,
      conversation,
      inputValue: type === 'rename' ? conversation.name : ''
    });
  };

  /**
   * 处理会话选择
   */
  const handleConversationSelect = (conversation: TChatConversation) => {
    ipcBridge.conversation.create.invoke({
      type: 'gemini',
      model: conversation.model,
      extra: { workspace: conversation.extra.workspace },
    });
    navigate(`/conversation/${conversation.id}`);
  };

  const isConversation = !!id;

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const history = await ChatStorage.get('chat.history');
        if (history) {
          setChatHistory(history.sort((a, b) => b.createTime - a.createTime));
        }
      } catch (error) {
        console.error('获取聊天历史失败:', error);
      }
    };
    
    fetchHistory();
  }, [isConversation]);

  /**
   * 处理删除会话操作
   * 1. 调用IPC接口删除会话
   * 2. 更新本地状态
   * 3. 重置模态框状态
   * 4. 显示操作结果提示
   * 5. 删除成功后跳转到首页
   */
  const handleRemoveConversation = async (id: string) => {
    try {
      const success = await ipcBridge.conversation.remove.invoke({ id });
      
      if (success) {
        setChatHistory(prev => prev.filter(item => item.id !== id));
        message.success(t('messages.deleteSuccess'));
        navigate('/');
      } else {
        message.error(t('messages.deleteFailed'));
      }
    } catch (error) {
      console.error('删除操作异常:', error);
      message.error(t('messages.deleteFailed'));
    } finally {
      resetModalState();
    }
  };

  /**
   * 处理重命名确认操作
   * 1. 调用IPC接口重命名会话
   * 2. 更新本地状态
   * 3. 同步更新顶部标题（如果当前正在查看该会话）
   * 4. 显示操作结果提示
   */
  const handleRenameConfirm = async () => {
    if (!modalState.conversation || !modalState.inputValue.trim()) return;
    
    try {
      const success = await ipcBridge.conversation.rename.invoke({
        id: modalState.conversation.id,
        name: modalState.inputValue.trim()
      });
      
      if (success) {
        setChatHistory(prev => prev.map(item => 
          item.id === modalState.conversation.id 
            ? { ...item, name: modalState.inputValue.trim() }
            : item
        ));
        message.success(t('messages.renameSuccess'));
        
        // 如果当前正在查看这个会话，同步更新顶部标题
        if (id === modalState.conversation.id) {
          mutate(`conversation/${id}`);
        }
      } else {
        message.error(t('messages.renameFailed'));
      }
    } catch (error) {
      console.error('重命名操作异常:', error);
      message.error(t('messages.renameFailed'));
    } finally {
      resetModalState();
    }
  };

  const handleRenameCancel = resetModalState;

  /**
   * 处理菜单重命名点击
   */
  const handleMenuRename = (conversation: TChatConversation) => {
    openModal('rename', conversation);
  };

  /**
   * 处理菜单删除点击
   */
  const handleMenuDelete = (conversation: TChatConversation) => {
    openModal('delete', conversation);
  };

  /**
   * 处理删除模态框确认
   */
  const handleDeleteConfirm = () => {
    if (modalState.conversation) {
      handleRemoveConversation(modalState.conversation.id);
    }
  };

  /**
   * 处理删除模态框取消
   */
  const handleDeleteCancel = resetModalState;

  /**
   * 处理输入框值变化
   */
  const handleInputChange = (value: string) => {
    setModalState(prev => ({ ...prev, inputValue: value }));
  };

  /**
   * 处理事件冒泡阻止
   */
  const handleStopPropagation = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  const formatTimeline = useTimeline();

  const renderConversation = (conversation: TChatConversation) => {
    const isSelected = id === conversation.id;
    
    const menu = (
      <Menu>
        <Menu.Item key="rename" onClick={() => handleMenuRename(conversation)}>
          {t('conversation.history.rename')}
        </Menu.Item>
        <Menu.Item key="delete" onClick={() => handleMenuDelete(conversation)}>
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
        onClick={() => handleConversationSelect(conversation)}
      >
        <MessageOne theme='outline' size='20' className='mt-2px ml-2px mr-8px flex' />
        <FlexFullContainer className='h-24px'>
          <div className='text-nowrap overflow-hidden inline-block w-full text-14px lh-24px  whitespace-nowrap'>{conversation.name}</div>
        </FlexFullContainer>
        <div
          className={classNames('absolute right--15px top-0px h-full w-70px items-center justify-center hidden group-hover:flex !collapsed-hidden')}
          style={{
            backgroundImage: `linear-gradient(to right, rgba(219, 234, 254, 0), #E5E7F0 50%)`,
          }}
          onClick={handleStopPropagation}
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
          'flex flex-col overflow-y-auto': chatHistory.length > 0,
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
        visible={modalState.type === 'rename'}
        onOk={handleRenameConfirm}
        onCancel={handleRenameCancel}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
      >
        <Input
          value={modalState.inputValue}
          onChange={handleInputChange}
          placeholder={t('conversation.history.renamePlaceholder')}
          onPressEnter={handleRenameConfirm}
        />
      </Modal>

      {/* 删除确认模态框 */}
      <Modal
        title={t('conversation.history.deleteTitle')}
        visible={modalState.type === 'delete'}
        onOk={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        okText={t('common.delete')}
        cancelText={t('common.cancel')}
      >
        <p>{t('conversation.history.deleteConfirm')}</p>
      </Modal>
    </FlexFullContainer>
  );
};

export default ChatHistory;
