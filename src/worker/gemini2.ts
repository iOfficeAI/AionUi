/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/// 多线程管理模型
// 1. 主进程管理子进程 -》 进程管理器，需要维护当前所有子进程，并负责子进程的通信操作
// 2. 子进程管理，需要根据不同的agent处理不同的agent任务，同时所有子进程具备相同的通信机制
import { GeminiAgent2 } from "@/agent/gemini2";
import { forkTask } from "./utils";
import { readDirectoryRecursive } from "@/process/utils";
import path from "path";
export default forkTask(async ({ data }, pipe) => {
  pipe.log("gemini.init", data);
  const agent = new GeminiAgent2({
    ...data,
    onStreamEvent(event) {
      if (event.type === "tool_group") {
        event.data = event.data.map((tool: any) => {
          const { confirmationDetails, ...other } = tool;
          if (confirmationDetails) {
            const { onConfirm, ...details } = confirmationDetails;
            pipe.once(tool.callId, (confirmKey: string) => {
              onConfirm(confirmKey);
            });
            return {
              ...other,
              confirmationDetails: details,
            };
          }
          return other;
        });
      }
      pipe.call("gemini.message", event);
    },
  });
  pipe.on("stop.stream", (_, deferred) => {
    deferred.with(agent.stop());
  });
  pipe.on(
    "send.message",
    (event: { input: string; msg_id: string }, deferred) => {
      deferred.with(agent.send(event.input, event.msg_id));
    }
  );
  pipe.on("gemini.get.workspace", async (_, deferred) => {
    await agent.bootstrap;
    deferred.with(
      readDirectoryRecursive(
        data.workspace,
        path.join(data.workspace, "/"),
        agent.config.getFileService()
      ).then((res) => (res ? [res] : []))
    );
  });

  return agent.bootstrap;
});
