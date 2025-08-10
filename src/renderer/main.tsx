/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, SettingTwo } from "@icon-park/react";
import ChatHistory from "./conversation/ChatHistory";
import ChatConversation from "./conversation/ChatConversation";
import { TChatConversation } from "@/common/storage";
import Layout from "./layout";
import ConversationWelcome from "./conversation/ConversationWelcome";
import ChatSider from "./conversation/ChatSider";
import { ipcBridge } from "@/common";
import Settings from "./panel/settings";
import { ConversationPromptDraftProvider } from "./messages/hooks";

const Main = () => {
  const { t } = useTranslation();
  const [currentConversation, setCurrentConversation] =
    useState<TChatConversation>();
  const [chatHistory, setChatHistory] = useState<TChatConversation[]>([]);

  const [currentPane, setCurrentPane] = useState<"guid" | "chat" | "settings">(
    "guid"
  );

  const [conversationPrompt, setConversationPrompt] = useState<Record<TChatConversation["id"], string>>({});

  const panel = useMemo(() => {
    switch (currentPane) {
      case "guid":
        return (
          <ConversationWelcome
            onCreateConversation={(conversation) => {
              setChatHistory((history) => {
                const index = history.findIndex(
                  (item) => item.id === conversation.id
                );
                if (index !== -1) {
                  history.splice(index, 1);
                }
                history.unshift(conversation);
                return history;
              });
              setCurrentConversation(conversation);
              setCurrentPane("chat");
            }}
          />
        );
      case "chat":
        if (!currentConversation) return null;
        return (
          <ChatConversation
            conversation={currentConversation}
          ></ChatConversation>
        );
      case "settings":
        return (
          <Settings
            onBack={() => {
              setCurrentConversation(undefined);
              setCurrentPane("guid");
            }}
          ></Settings>
        );
    }
    return <></>;
  }, [currentPane, currentConversation]);

  const rightSiderTitle = useMemo(() => {
    switch (currentConversation?.type) {
      case "gemini":
        return (
          <span className="text-16px font-bold color-#111827">
            {t("conversation.workspace.title")}
          </span>
        );
    }
    return null;
  }, [currentConversation, t]);

  const rightSider = useMemo(() => {
    if (currentPane !== "chat") return null;
    switch (currentConversation?.type) {
      case "gemini":
        return <ChatSider conversation={currentConversation} />;
    }
    return null;
  }, [currentConversation, currentPane]);

  const title = useMemo(() => {
    return (
      <span className=" ml-16px font-bold text-16px inline-block overflow-hidden text-ellipsis whitespace-nowrap w-full max-w-60%">
        {currentConversation?.name}
      </span>
    );
    return null;
  }, [currentConversation]);

  useEffect(() => {
    if (!currentConversation) return;
    if (chatHistory.some((item) => item.id === currentConversation.id)) return;
    setCurrentConversation(undefined);
  }, [currentConversation, chatHistory]);

  useEffect(() => {
    if (currentPane !== "chat") {
      setCurrentConversation(undefined);
    }
  }, [currentPane]);

  return (
    <Layout
      title={title}
      rightSiderTitle={rightSiderTitle}
      rightSider={rightSider}
      sider={
        <div className="size-full flex flex-col">
          <div
            className="flex items-center justify-start gap-10px px-12px py-8px hover:bg-#f3f4f6 rd-0.5rem mb-8px cursor-pointer group"
            onClick={() => {
              if (currentPane === "guid") return;
              setCurrentPane("guid");
            }}
          >
            <Plus theme="outline" size="24" fill="#333" className="flex" />
            <span className="collapsed-hidden font-bold">
              {t("conversation.welcome.newConversation")}
            </span>
          </div>
          {/* <Divider className="!m-0 collapsed-hidden"></Divider> */}
          <ChatHistory
            chatHistory={chatHistory}
            setChatHistory={setChatHistory}
            onRemove={(id) => {
              ipcBridge.removeConversation.invoke({ id }).then((success) => {
                if (success) {
                  if (currentConversation?.id === id) {
                    setCurrentPane("guid");
                  }
                  setChatHistory(chatHistory.filter((item) => item.id !== id));
                  setConversationPrompt((draft) => {
                    const newState = {...draft};
                    delete newState[id];
                    return newState;
                  });
                }
              });
            }}
            selected={currentConversation}
            onSelect={(conversation) => {
              setCurrentPane("chat");
              setCurrentConversation(conversation);
            }}
          ></ChatHistory>

          <div
            onClick={() => {
              setCurrentPane("settings");
              setCurrentConversation(undefined);
            }}
            className="flex items-center justify-start gap-10px px-12px py-8px hover:bg-#f3f4f6 rd-0.5rem mb-8px cursor-pointer"
          >
            <SettingTwo
              className="flex"
              theme="outline"
              size="24"
              fill="#333"
            />
            <span className="collapsed-hidden">{t("common.settings")}</span>
          </div>
        </div>
      }
    >
      <ConversationPromptDraftProvider value={conversationPrompt}>
        {panel}
      </ConversationPromptDraftProvider>
    </Layout>
  );
};

export default Main;
