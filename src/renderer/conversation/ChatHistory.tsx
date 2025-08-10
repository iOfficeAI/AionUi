/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatStorage, TChatConversation } from "@/common/storage";
import { Empty, Popconfirm } from "@arco-design/web-react";
import { DeleteOne, MessageOne } from "@icon-park/react";
import classNames from "classnames";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import FlexFullContainer from "../components/FlexFullContainer";
import { ipcBridge } from "@/common";

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
    if (diffDay(current, time) === 0) return t("conversation.history.today");
    if (diffDay(current, time) === 1)
      return t("conversation.history.yesterday");
    if (diffDay(current, time) < 7)
      return t("conversation.history.recent7Days");
    return t("conversation.history.earlier");
  };
  return (conversation: TChatConversation) => {
    const time = conversation.createTime;
    const formatStr = format(time);
    if (prevTime && formatStr === format(prevTime)) {
      prevTime = time;
      return "";
    }
    prevTime = time;
    return formatStr;
  };
};

const ChatHistory: React.FC<{
  selected: TChatConversation;
  onSelect: (conversation: TChatConversation) => void;
  chatHistory: TChatConversation[];
  onRemove: (id: string) => void;
  setChatHistory: React.Dispatch<React.SetStateAction<TChatConversation[]>>;
}> = ({ selected, onSelect, chatHistory, setChatHistory, ...props }) => {
  const { t } = useTranslation();
  const handleSelect = (conversation: TChatConversation) => {
    ipcBridge.createConversation.invoke({
      type: "gemini",
      extra: { workspace: conversation.extra.workspace },
    });
    onSelect(conversation);
  };

  useEffect(() => {
    ChatStorage.get("chat.history").then((history) => {
      if (history) {
        setChatHistory(
          history.sort((a, b) => (b.createTime - a.createTime < 0 ? -1 : 1))
        );
      }
    });
  }, []);

  const handleRemoveConversation = (id: string) => {
    props.onRemove(id);
  };

  const formatTimeline = useTimeline();

  const renderConversation = (conversation: TChatConversation) => {
    const isSelected = selected?.id === conversation.id;
    return (
      <div
        key={conversation.id}
        id={"c-" + conversation.id}
        className={classNames(
          "hover:bg-#EBECF1 px-12px py-8px rd-8px flex justify-start items-center group cursor-pointer relative overflow-hidden group shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px",
          {
            "!bg-#E5E7F0 ": isSelected,
          }
        )}
        onClick={handleSelect.bind(null, conversation)}
      >
        <MessageOne
          theme="outline"
          size="20"
          className="mt-2px ml-2px mr-8px flex"
        />
        <FlexFullContainer className="h-24px">
          <div className="text-nowrap overflow-hidden inline-block w-full text-14px lh-24px  whitespace-nowrap">
            {conversation.name}
          </div>
        </FlexFullContainer>
        <div
          className={classNames(
            "absolute right--15px top-0px h-full w-70px items-center justify-center hidden group-hover:flex !collapsed-hidden"
          )}
          style={{
            backgroundImage: `linear-gradient(to right, rgba(219, 234, 254, 0),${
              isSelected ? "#E5E7F0" : "#E5E7F0"
            } 50%)`,
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <Popconfirm
            title={t("conversation.history.deleteTitle")}
            content={t("conversation.history.deleteConfirm")}
            okText={t("conversation.history.confirmDelete")}
            cancelText={t("conversation.history.cancelDelete")}
            onOk={(event) => {
              event.stopPropagation();
              handleRemoveConversation(conversation.id);
            }}
            onCancel={(event) => {
              event.stopPropagation();
            }}
          >
            <span
              className="flex-center"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <DeleteOne theme="outline" size="20" className="flex" />
            </span>
          </Popconfirm>
        </div>
      </div>
    );
  };
  return (
    <FlexFullContainer>
      <div
        className={classNames("size-full", {
          "flex-center size-full": !chatHistory.length,
          "flex flex-col overflow-y-auto": !!chatHistory.length,
        })}
      >
        {!chatHistory.length ? (
          <Empty
            className={"collapsed-hidden"}
            description={t("conversation.history.noHistory")}
          />
        ) : (
          chatHistory.map((item) => {
            const timeline = formatTimeline(item);
            return (
              <React.Fragment key={item.id}>
                {timeline && (
                  <div className="collapsed-hidden px-12px py-8px text-13px color-#555 font-bold">
                    {timeline}
                  </div>
                )}
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
