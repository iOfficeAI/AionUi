/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ServerGeminiStreamEvent,
  ToolCallRequestInfo,
  ServerGeminiContentEvent as ContentEvent,
  Config,
  CompletedToolCall} from "@google/gemini-cli-core";
import {
  GeminiEventType as ServerGeminiEventType,
  executeToolCall
} from "@google/gemini-cli-core";
import { parseAndFormatApiError } from "./cli/errorParsing";

enum StreamProcessingStatus {
  Completed,
  UserCancelled,
  Error,
}

const handleContentEvent = (
  eventValue: ContentEvent["value"],
  currentGeminiMessageBuffer: string
): string => {
  const newGeminiMessageBuffer = currentGeminiMessageBuffer + eventValue;
  return newGeminiMessageBuffer;
};

export const processGeminiStreamEvents = async (
  stream: AsyncIterable<ServerGeminiStreamEvent>,
  config: Config,
  onStreamEvent: (event: {
    type: ServerGeminiStreamEvent["type"];
    data: any;
  }) => void
): Promise<StreamProcessingStatus> => {
  for await (const event of stream) {
    console.log("processGeminiStreamEvents.event", event);
    switch (event.type) {
      case ServerGeminiEventType.Thought:
        onStreamEvent({ type: event.type, data: event.value });
        break;
      case ServerGeminiEventType.Content:
        onStreamEvent({ type: event.type, data: event.value });
        break;
      case ServerGeminiEventType.ToolCallRequest:
        onStreamEvent({ type: event.type, data: event.value });
        break;
      case ServerGeminiEventType.UserCancelled:
        break;
      case ServerGeminiEventType.Error:
        {
          onStreamEvent({
            type: event.type,
            data: parseAndFormatApiError(
              event.value.error,
              config.getContentGeneratorConfig().authType
            ),
          });
        }
        break;
      case ServerGeminiEventType.ChatCompressed:
        break;
      case ServerGeminiEventType.ToolCallConfirmation:
      case ServerGeminiEventType.ToolCallResponse:
        break;
      default: {
        // enforces exhaustive switch-case
        const unreachable: never = event;
        return unreachable;
      }
    }
  }
  return StreamProcessingStatus.Completed;
};

export const processGeminiFunctionCalls = async (
  config: Config,
  functionCalls: ToolCallRequestInfo[],
  onProgress: (event: {
    type:
      | "tool_call_request"
      | "tool_call_response"
      | "tool_call_error"
      | "tool_call_finish";
    data: any;
  }) => Promise<any>
) => {
  const toolResponseParts = [];

  for (const fc of functionCalls) {
    const callId = fc.callId ?? `${fc.name}-${Date.now()}`;
    const requestInfo = {
      callId,
      name: fc.name,
      args: fc.args ?? {},
      isClientInitiated: false,
    };
    await onProgress({
      type: "tool_call_request",
      data: requestInfo,
    });
    const toolRegistry = await config.getToolRegistry();
    const abortController = new AbortController();

    const toolResponse = await executeToolCall(
      config,
      requestInfo,
      toolRegistry,
      abortController.signal
    );
    if (toolResponse.error) {
      await onProgress({
        type: "tool_call_error",
        data: Object.assign({}, requestInfo, {
          status: "error",
          error: `Error executing tool ${fc.name}: ${
            toolResponse.resultDisplay || toolResponse.error.message
          }`,
        }),
      });
      return;
    }
    await onProgress({
      type: "tool_call_finish",
      data: Object.assign({}, requestInfo, {
        status: "success",
      }),
    });

    if (toolResponse.responseParts) {
      const parts = Array.isArray(toolResponse.responseParts)
        ? toolResponse.responseParts
        : [toolResponse.responseParts];
      for (const part of parts) {
        if (typeof part === "string") {
          toolResponseParts.push({ text: part });
        } else if (part) {
          toolResponseParts.push(part);
        }
      }
    }
  }
  await onProgress({
    type: "tool_call_finish",
    data: toolResponseParts,
  });
};

export const handleCompletedTools = async (
  completedToolCallsFromScheduler: CompletedToolCall[],
  geminiClient: any,
  performMemoryRefresh: () => void
) => {
  const completedAndReadyToSubmitTools = completedToolCallsFromScheduler.filter(
    (tc) => {
      const isTerminalState =
        tc.status === "success" ||
        tc.status === "error" ||
        tc.status === "cancelled";
      if (isTerminalState) {
        const completedOrCancelledCall = tc;
        return completedOrCancelledCall.response?.responseParts !== undefined;
      }
      return false;
    }
  );
  // Finalize any client-initiated tools as soon as they are done.
  const clientTools = completedAndReadyToSubmitTools.filter(
    (t) => t.request.isClientInitiated
  );
  if (clientTools.length > 0) {
    // markToolsAsSubmitted(clientTools.map((t) => t.request.callId)); responseSubmittedToGemini=true
  }
  // Identify new, successful save_memory calls that we haven't processed yet.
  const newSuccessfulMemorySaves = completedAndReadyToSubmitTools.filter(
    (t) => t.request.name === "save_memory" && t.status === "success"
    // !processedMemoryToolsRef.current.has(t.request.callId)
  );
  if (newSuccessfulMemorySaves.length > 0) {
    // Perform the refresh only if there are new ones.
    void performMemoryRefresh();
    // Mark them as processed so we don't do this again on the next render.
    // newSuccessfulMemorySaves.forEach((t) =>
    //   processedMemoryToolsRef.current.add(t.request.callId)
    // );
  }
  const geminiTools = completedAndReadyToSubmitTools.filter(
    (t) => !t.request.isClientInitiated
  );
  if (geminiTools.length === 0) {
    return;
  }
  // If all the tools were cancelled, don't submit a response to Gemini.
  const allToolsCancelled = geminiTools.every(
    (tc) => tc.status === "cancelled"
  );
  if (allToolsCancelled) {
    if (geminiClient) {
      // We need to manually add the function responses to the history
      // so the model knows the tools were cancelled.
      const responsesToAdd = geminiTools.flatMap(
        (toolCall) => toolCall.response.responseParts
      );
      for (const response of responsesToAdd) {
        let parts;
        if (Array.isArray(response)) {
          parts = response;
        } else if (typeof response === "string") {
          parts = [{ text: response }];
        } else {
          parts = [response];
        }
        geminiClient.addHistory({
          role: "user",
          parts,
        });
      }
    }
    // const callIdsToMarkAsSubmitted = geminiTools.map(
    //   (toolCall) => toolCall.request.callId
    // );
    // markToolsAsSubmitted(callIdsToMarkAsSubmitted);
    return;
  }
  const responsesToSend = geminiTools.map(
    (toolCall) => toolCall.response.responseParts
  );
  // const callIdsToMarkAsSubmitted = geminiTools.map(
  //   (toolCall) => toolCall.request.callId
  // );
  // markToolsAsSubmitted(callIdsToMarkAsSubmitted);

  function mergePartListUnions(list: any[]) {
    const resultParts = [];
    for (const item of list) {
      if (Array.isArray(item)) {
        resultParts.push(...item);
      } else {
        resultParts.push(item);
      }
    }
    return resultParts;
  }
  return mergePartListUnions(responsesToSend);
};
