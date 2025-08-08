/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/core/ConfigManager.ts
import {
  AuthType,
  Config,
  GeminiClient,
  sessionId,
  ToolCallRequestInfo,
  ServerGeminiStreamEvent,
  CoreToolScheduler,
  CompletedToolCall,
  ToolCall,
} from "@google/gemini-cli-core";
import { Extension, loadExtensions } from "./cli/extension";
import { loadSettings } from "./cli/settings";
import { loadCliConfig, loadHierarchicalGeminiMemory } from "./cli/config";
import { handleCompletedTools, processGeminiStreamEvents } from "./utils";
import { handleAtCommand } from "./cli/atCommandProcessor";
import { execSync } from "child_process";
import { mapToDisplay } from "./cli/useReactToolScheduler";
import { uuid } from "@/common/utils";

function mergeMcpServers(
  settings: ReturnType<typeof loadSettings>["merged"],
  extensions: Extension[]
) {
  const mcpServers = { ...(settings.mcpServers || {}) };
  for (const extension of extensions) {
    Object.entries(extension.config.mcpServers || {}).forEach(
      ([key, server]) => {
        if (mcpServers[key]) {
          console.warn(
            `Skipping extension MCP config for server with key "${key}" as it already exists.`
          );
          return;
        }
        mcpServers[key] = server;
      }
    );
  }
  return mcpServers;
}

const realValue = (value: string) => {
  return value && value !== "undefined";
};

export class GeminiAgent {
  config: Config | null = null;
  private workspace: string | null = null;
  private proxy: string | null = null;
  private geminiClient: GeminiClient | null = null;
  private authType: AuthType | null = null;
  private scheduler: CoreToolScheduler | null = null;
  private trackedCalls: ToolCall[] = [];
  private abortController: AbortController | null = null;
  private onStreamEvent: (event: {
    type: string;
    data: any;
    msg_id: string;
  }) => void;
  bootstrap: Promise<void>;
  constructor(options: {
    workspace: string;
    proxy?: string;
    authType?: AuthType;
    GEMINI_API_KEY?: string;
    GOOGLE_API_KEY?: string;
    GOOGLE_GEMINI_BASE_URL?: string;
    GOOGLE_CLOUD_PROJECT?: string;
    onStreamEvent: (event: { type: string; data: any; msg_id: string }) => void;
  }) {
    this.workspace = options.workspace;
    this.proxy = options.proxy;
    this.authType = options.authType;
    this.onStreamEvent = options.onStreamEvent;

    const env = this.getEnv();

    const fallbackValue = (value1: string, value2: string) => {
      if (value1 && value1 !== "undefined") {
        return value1;
      }
      return value2;
    };

    if (this.authType === AuthType.USE_GEMINI) {
      process.env.GEMINI_API_KEY = fallbackValue(
        options?.GEMINI_API_KEY,
        env.GEMINI_API_KEY
      );
    } else if (this.authType === AuthType.USE_VERTEX_AI) {
      process.env.GOOGLE_API_KEY = fallbackValue(
        options?.GOOGLE_API_KEY,
        env.GOOGLE_API_KEY
      );
      process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
    } else if (this.authType === AuthType.LOGIN_WITH_GOOGLE) {
      process.env.GOOGLE_CLOUD_PROJECT = fallbackValue(
        options?.GOOGLE_CLOUD_PROJECT,
        env.GOOGLE_CLOUD_PROJECT
      );
    }
    if (options?.GOOGLE_GEMINI_BASE_URL && options?.GOOGLE_GEMINI_BASE_URL !== "undefined") {
      process.env.GOOGLE_GEMINI_BASE_URL = options?.GOOGLE_GEMINI_BASE_URL;
    }
    this.bootstrap = this.initialize();
    this.bootstrap.then(() => {
      this.initToolScheduler();
    });
  }

  // 加载环境变量
  private getEnv() {
    let command = "";
    if (process.platform === "win32") {
      command = "cmd /c set";
    }
    if (process.platform === "darwin") {
      command = "zsh -ic 'env'";
    }
    if (!command) return {};

    const envOutput = execSync(command, { encoding: "utf8" });

    return envOutput.split("\n").reduce<Record<string, string>>((acc, line) => {
      const [key, ...value] = line.split("=");
      acc[key] = value.join("=");
      return acc;
    }, {});
    const lines = envOutput.split("\n");
    for (let i = 0, len = lines.length; i < len; i++) {
      const line = lines[i];
      const [key, ...value] = line.split("=");
      if (key === "GOOGLE_GEMINI_BASE_URL") {
        process.env.GOOGLE_GEMINI_BASE_URL = value.join("=");
        break;
      }
    }
  }
  private createAbortController() {
    this.abortController = new AbortController();
    return this.abortController;
  }

  private async initialize(): Promise<void> {
    const path = this.workspace;

    const settings = loadSettings(path).merged;

    const extensions = loadExtensions(path);
    this.config = await loadCliConfig({
      workspace: path,
      settings,
      extensions,
      sessionId,
      proxy: this.proxy,
    });

    await this.config.refreshAuth(this.authType || AuthType.USE_GEMINI);

    this.geminiClient = this.config.getGeminiClient();
  }

  // 初始化调度工具
  private initToolScheduler() {
    this.scheduler = new CoreToolScheduler({
      toolRegistry: this.config.getToolRegistry(),
      onAllToolCallsComplete: async (
        completedToolCalls: CompletedToolCall[]
      ) => {
        if (completedToolCalls.length > 0) {
          const refreshMemory = async () => {
            const config = this.config;
            const { memoryContent, fileCount } =
              await loadHierarchicalGeminiMemory(
                process.cwd(),
                config.getDebugMode(),
                config.getFileService(),
                config.getExtensionContextFilePaths()
              );
            config.setUserMemory(memoryContent);
            config.setGeminiMdFileCount(fileCount);
          };
          const response = await handleCompletedTools(
            completedToolCalls,
            this.geminiClient,
            refreshMemory
          );
          if (response.length > 0) {
            this.submitQuery(response, uuid(), this.createAbortController());
          }
        }
      },
      onToolCallsUpdate: (updatedCoreToolCalls: ToolCall[]) => {
        const prevTrackedCalls = this.trackedCalls || [];
        const toolCalls = updatedCoreToolCalls.map((coreTc) => {
          const existingTrackedCall = prevTrackedCalls.find(
            (ptc) => ptc.request.callId === coreTc.request.callId
          );
          const newTrackedCall = {
            ...coreTc,
            responseSubmittedToGemini:
              (existingTrackedCall as any)?.responseSubmittedToGemini ?? false,
          };
          return newTrackedCall;
        });
        const display = mapToDisplay(toolCalls);
        this.onStreamEvent({
          type: "tool_group",
          data: display.tools,
          msg_id: uuid(),
        });
      },
      approvalMode: this.config.getApprovalMode(),
      getPreferredEditor() {
        return "vscode";
      },
      config: this.config,
    });
  }

  private async handleMessage(
    stream: AsyncGenerator<ServerGeminiStreamEvent, any, any>,
    msg_id: string,
    abortController: AbortController
  ): Promise<any> {
    const toolCallRequests: ToolCallRequestInfo[] = [];

    return processGeminiStreamEvents(stream, this.config, (data) => {
      console.log("processGeminiStreamEvents", data);
      if (data.type === "tool_call_request") {
        toolCallRequests.push(data.data);
        return;
      }
      this.onStreamEvent({
        ...data,
        msg_id,
      });
    })
      .then(() => {
        console.log("processGeminiStreamEvents.then", toolCallRequests);
        if (toolCallRequests.length > 0) {
          this.scheduler.schedule(toolCallRequests, abortController.signal);
        }
      })
      .catch((e) => {
        this.onStreamEvent({
          type: "error",
          data: e.message,
          msg_id,
        });
      });
  }

  async submitQuery(
    query: any,
    msg_id: string,
    abortController: AbortController
  ) {
    try {
      const stream = await this.geminiClient.sendMessageStream(
        query,
        abortController.signal
      );
      this.onStreamEvent({
        type: "start",
        data: "",
        msg_id,
      });
      this.handleMessage(stream, msg_id, abortController)
        .catch((e: any) => {
          this.onStreamEvent({
            type: "error",
            data: e?.message || JSON.stringify(e),
            msg_id,
          });
        })
        .finally(() => {
          this.onStreamEvent({
            type: "finish",
            data: "",
            msg_id,
          });
        });
      return "";
    } catch (e) {
      this.onStreamEvent({
        type: "error",
        data: e.message,
        msg_id,
      });
    }
  }

  async send(message: string | Array<{ text: string }>, msg_id = "") {
    await this.bootstrap;
    const abortController = this.createAbortController();
    const { processedQuery, shouldProceed } = await handleAtCommand({
      query: Array.isArray(message) ? message[0].text : message,
      config: this.config,
      addItem: () => {
        console.log("addItem");
      },
      onDebugMessage(log: any) {
        console.log("onDebugMessage", log);
      },
      messageId: msg_id,
      signal: abortController.signal,
    });
    if (
      !shouldProceed ||
      processedQuery === null ||
      abortController.signal.aborted
    ) {
      return;
    }
    return this.submitQuery(processedQuery, msg_id, abortController);
  }
  async stop() {
    this.abortController?.abort();
  }
}
