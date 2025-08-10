/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import FlexFullContainer from "@renderer/components/FlexFullContainer";
import MessageList from "@renderer/messages/MessageList";
import {
  MessageListProvider,
  useAddOrUpdateMessage,
  useChatPromptDraftByKey,
  useMessageLstCache,
  useUpdateChatPromptDraftByKey,
} from "@renderer/messages/hooks";
import { ipcBridge } from "@/common";
import { uuid } from "@renderer/utils/common";
import SendBox from "@renderer/components/sendbox";
import HOC from "@renderer/utils/HOC";
import { Button, Tag } from "@arco-design/web-react";
import classNames from "classnames";
import { transformMessage } from "@/common/chatLib";
import { emitter, useAddEventListener } from "@/renderer/utils/emitter";
import { Plus } from "@icon-park/react";

const useGeminiMessage = (conversation_id: string) => {
  const addMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);
  const [thought, setThought] = useState({
    description: "",
    subject: "",
  });
  useEffect(() => {
    return ipcBridge.geminiConversation.responseStream.on(async (message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }
      console.log("responseStream.message", message);
      switch (message.type) {
        case "thought":
          setThought(message.data);
          break;
        case "start":
          setRunning(true);
          break;
        case "finish":
          {
            setRunning(false);
            setThought({ subject: "", description: "" });
          }
          break;
        default:
          {
            addMessage(transformMessage(message));
          }
          break;
      }
    });
  }, [conversation_id]);

  useEffect(() => {
    setRunning(false);
    setThought({ subject: "", description: "" });
    ipcBridge.getConversation.invoke({ id: conversation_id }).then((res) => {
      if (!res) return;
      if (res.status === "running") {
        setRunning(true);
      }
    });
  }, [conversation_id]);

  return { thought, setThought, running };
};

const GeminiChat: React.FC<{
  workspace: string;
  conversation_id: string;
}> = ({ conversation_id }) => {
  const [atPath, setAtPath] = useState<string[]>([]);
  const { thought, running } = useGeminiMessage(conversation_id);
  const [uploadFile, setUploadFile] = useState<string[]>([]);
  const addMessage = useAddOrUpdateMessage();

  const onSendHandler = async (message: string) => {
    const msg_id = uuid();
    if (atPath.length || uploadFile.length) {
      message =
        uploadFile.map((p) => "@" + p.split("/").pop()).join(" ") +
        " " +
        atPath.map((p) => "@" + p).join(" ") +
        " " +
        message;
    }
    addMessage(
      {
        id: msg_id,
        type: "text",
        position: "right",
        conversation_id,
        content: {
          content: message,
        },
      },
      true
    );
    await ipcBridge.geminiConversation.sendMessage.invoke({
      input: message,
      msg_id,
      conversation_id,
      files: uploadFile,
    });
    emitter.emit("gemini.selected.file.clear");
    if (uploadFile.length) {
      emitter.emit("gemini.workspace.refresh");
    }
    setAtPath([]);
    setUploadFile([]);
  };

  useMessageLstCache(conversation_id);

  useAddEventListener("gemini.selected.file", setAtPath);

  useEffect(() => {
    setUploadFile([]);
    setAtPath([]);
  }, [conversation_id]);

  // 考虑到现在 Layout 的布局方式，不会同时存在多个 ChatConversation 组件
  // 也就不会有多个 chat prompt draft 的消费端
  // 因此直接在具体 Chat 组件中消费也不会造成过多消费者的性能隐患
  const prompt = useChatPromptDraftByKey(conversation_id);
  const setPrompt = useUpdateChatPromptDraftByKey(conversation_id);

  return (
    <div className="h-full  flex flex-col px-20px">
      <FlexFullContainer>
        <MessageList className="flex-1"></MessageList>
      </FlexFullContainer>
      <div className="max-w-800px w-full  mx-auto flex flex-col">
        {thought.subject ? (
          <div
            className=" px-10px py-10px rd-20px text-14px pb-40px  lh-20px color-#86909C"
            style={{
              background: "linear-gradient(90deg, #F0F3FF 0%, #F2F2F2 100%)",
              transform: "translateY(36px)",
            }}
          >
            <Tag color="arcoblue" size="small" className={"float-left mr-4px"}>
              {thought.subject}
            </Tag>
            {/* <FlexFullContainer> */}
            {/* <div className="text-nowrap overflow-hidden text-ellipsis"> */}
            {thought.description}
            {/* </div> */}
            {/* </FlexFullContainer> */}
          </div>
        ) : null}

        <SendBox
          value={prompt}
          onChange={setPrompt}
          loading={running}
          onStop={() => {
            return ipcBridge.stopStream.invoke({ conversation_id }).then(() => {
              console.log("stopStream");
            });
          }}
          className={classNames("z-10 ", {
            "mt-0px": !!thought.subject,
          })}
          tools={
            <Button
              type="secondary"
              shape="circle"
              icon={
                <Plus theme="outline" size="14" strokeWidth={2} fill="#333" />
              }
              onClick={() => {
                ipcBridge.openFileDialog
                  .invoke({
                    properties: ["openFile", "multiSelections"],
                  })
                  .then((files) => {
                    setUploadFile(files || []);
                  });
              }}
            ></Button>
          }
          prefix={
            <>
              {uploadFile.map((path) => {
                return (
                  <Tag
                    color="blue"
                    key={path}
                    closable
                    className={"mr-4px"}
                    onClose={() => {
                      setUploadFile(uploadFile.filter((v) => v !== path));
                    }}
                  >
                    {path.split("/").pop()}
                  </Tag>
                );
              })}
              {atPath.map((path) => (
                <Tag
                  key={path}
                  color="gray"
                  closable
                  className={"mr-4px"}
                  onClose={() => {
                    const newAtPath = atPath.filter((v) => v !== path);
                    emitter.emit("gemini.selected.file", newAtPath);
                    setAtPath(newAtPath);
                  }}
                >
                  {path}
                </Tag>
              ))}
            </>
          }
          onSend={onSendHandler}
        ></SendBox>
      </div>
    </div>
  );
};

export default HOC(MessageListProvider)(GeminiChat);
