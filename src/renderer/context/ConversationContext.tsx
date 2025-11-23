/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext } from 'react';

/**
 * Conversation context interface
 * 会话上下文接口
 */
export interface ConversationContextValue {
  /**
   * Conversation ID
   * 会话 ID
   */
  conversationId: string;

  /**
   * Workspace directory path
   * 工作空间目录路径
   */
  workspace?: string;

  /**
   * Conversation type
   * 会话类型
   */
  type: 'gemini' | 'acp' | 'codex';
}

/**
 * Conversation context
 * 会话上下文 - 提供会话级别的信息，如工作空间路径
 */
const ConversationContext = createContext<ConversationContextValue | null>(null);

/**
 * Conversation context provider
 * 会话上下文提供者
 */
export const ConversationProvider: React.FC<{
  children: React.ReactNode;
  value: ConversationContextValue;
}> = ({ children, value }) => {
  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
};

/**
 * Hook to use conversation context
 * 使用会话上下文的 Hook
 */
export const useConversationContext = (): ConversationContextValue => {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversationContext must be used within ConversationProvider');
  }
  return context;
};

/**
 * Hook to safely use conversation context (returns null if not in provider)
 * 安全使用会话上下文的 Hook（如果不在 provider 中则返回 null）
 */
export const useConversationContextSafe = (): ConversationContextValue | null => {
  return useContext(ConversationContext);
};
