/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
import { Alert, Checkbox } from "@arco-design/web-react";
import MarkdownView from "../components/Markdown";
import { diffStringsUnified } from "jest-diff";
import { html } from "diff2html";
import "diff2html/bundles/css/diff2html.min.css";
import type { IMessageToolCall } from "@/common/chatLib";
import { MessageSearch } from "@icon-park/react";

const Diff2Html = ({ message }: { message: IMessageToolCall }) => {
  const [sideBySide, setSideBySide] = useState(false);
  const diffHtmlContent = useMemo(() => {
    const diff = diffStringsUnified(
      message.content.args.new_string,
      message.content.args.old_string
    );
    const file = message.content.args.file_path;
    return html(
      `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n${diff}`,
      {
        outputFormat: sideBySide ? "side-by-side" : "line-by-line",
        drawFileList: false,
        matching: "lines",
        matchWordsThreshold: 0,
        maxLineLengthHighlight: 20,
        matchingMaxComparisons: 3,
        diffStyle: "word",
        renderNothingWhenEmpty: false,
      }
    );
  }, [message.content.args, sideBySide]);
  return (
    <div className="relative">
      <div
        dangerouslySetInnerHTML={{
          __html: diffHtmlContent,
        }}
      ></div>
      <div className="absolute top-12px right-10px flex items-center justify-center">
        <Checkbox
          className={"!flex items-center justify-center"}
          checked={sideBySide}
          onChange={(value) => setSideBySide(value)}
        >
          <span className="whitespace-nowrap">side-by-side</span>
        </Checkbox>
      </div>
    </div>
  );
};
const MessageToolCall: React.FC<{ message: IMessageToolCall }> = ({
  message,
}) => {
  if (
    ["list_directory", "read_file", "write_file"].includes(message.content.name)
  ) {
    const {
      absolute_path,
      path,
      file_path = absolute_path || path,
      status,
    } = message.content.args;
    const OpName =
      message.content.name === "read_file" ? "ReadFile" : "WriteFile";
    return (
      <Alert
        content={OpName + ":" + file_path}
        type={
          status === "error"
            ? "error"
            : status === "success"
            ? "success"
            : "info"
        }
      ></Alert>
    );
  }
  if (message.content.name === "google_web_search") {
    return (
      <Alert
        icon={<MessageSearch theme="outline" fill="#333" className="lh-[1]" />}
        content={message.content.args.query}
      ></Alert>
    );
  }
  if (message.content.name === "run_shell_command") {
    return (
      <MarkdownView>
        {`\`\`\`shell\n${message.content.args.command}\n#${message.content.args.description}`}
      </MarkdownView>
    );
  }
  if (message.content.name === "replace") {
    return <Diff2Html message={message}></Diff2Html>;
  }
  return <div>{message.content.name}</div>;
};

export default MessageToolCall;
