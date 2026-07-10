/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext } from 'react';

/**
 * 团队身份色的跨层读取通道。
 *
 * 消息渲染链（AssistantChatSlot → TeamChatView → AcpChat → MessageList → MessageText）很深，
 * teammate 消息只携带 `senderConversationId`，需据此回到成员实例取身份色，用于气泡左色条 + 彩色发送者名。
 * 用一个可选 context 提供解析函数：团队页包裹时提供，非团队会话渲染 MessageText 时 context 为 null，
 * 消息按原样渲染（无色条），因此对非团队场景零影响。
 */
type TeamIdentityContextValue = {
  colorOfConversation: (conversation_id: string | undefined) => string;
};

const TeamIdentityContext = createContext<TeamIdentityContextValue | null>(null);

export const TeamIdentityProvider: React.FC<{
  colorOfConversation: (conversation_id: string | undefined) => string;
  children: React.ReactNode;
}> = ({ colorOfConversation, children }) => {
  const value = React.useMemo(() => ({ colorOfConversation }), [colorOfConversation]);
  return <TeamIdentityContext.Provider value={value}>{children}</TeamIdentityContext.Provider>;
};

/** 取 teammate 消息发送者的身份色；非团队场景返回 undefined（不着色）。 */
export const useTeammateColor = (senderConversationId: string | undefined): string | undefined => {
  const ctx = useContext(TeamIdentityContext);
  if (!ctx || !senderConversationId) return undefined;
  return ctx.colorOfConversation(senderConversationId);
};
