/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CompletedToolCall, Config, GeminiClient, ServerGeminiStreamEvent, ToolCallRequestInfo } from '@office-ai/aioncli-core';
import { executeToolCall, GeminiEventType as ServerGeminiEventType } from '@office-ai/aioncli-core';
import { parseAndFormatApiError } from './cli/errorParsing';

enum StreamProcessingStatus {
  Completed,
  UserCancelled,
  Error,
}

export const processGeminiStreamEvents = async (stream: AsyncIterable<ServerGeminiStreamEvent>, config: Config, onStreamEvent: (event: { type: ServerGeminiStreamEvent['type']; data: unknown }) => void): Promise<StreamProcessingStatus> => {
  for await (const event of stream) {
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

      case ServerGeminiEventType.Error:
        {
          onStreamEvent({
            type: event.type,
            data: parseAndFormatApiError(event.value.error, config.getContentGeneratorConfig().authType),
          });
        }
        break;
      case ServerGeminiEventType.UserCancelled:
      case ServerGeminiEventType.ChatCompressed:
      case ServerGeminiEventType.ToolCallConfirmation:
      case ServerGeminiEventType.ToolCallResponse:
      case ServerGeminiEventType.MaxSessionTurns:
      case ServerGeminiEventType.Finished:
      case ServerGeminiEventType.LoopDetected:
        {
          // console.log('event>>>>>>>>>>>>>>>>>>>', event);
        }
        break;
      default: {
        // Some event types may not be handled yet
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _unhandled: any = event;
        console.warn('Unhandled event type:', _unhandled);
        break;
      }
    }
  }
  return StreamProcessingStatus.Completed;
};

/**
 * 规范化工具参数名称
 * 某些模型可能返回不同的参数名称，需要映射到工具期望的标准名称
 * Normalize tool parameter names - some models may return different param names
 */
const normalizeToolParams = (toolName: string, args: Record<string, unknown>): Record<string, unknown> => {
  const normalized = { ...args };

  // 文件操作工具：将 path 映射到 file_path
  // File operation tools: map 'path' to 'file_path'
  const fileTools = ['ReadFileTool', 'WriteFileTool', 'EditTool', 'read_file', 'write_file', 'edit'];
  if (fileTools.includes(toolName) && 'path' in normalized && !('file_path' in normalized)) {
    normalized.file_path = normalized.path;
    delete normalized.path;
  }

  return normalized;
};

export const processGeminiFunctionCalls = async (config: Config, functionCalls: ToolCallRequestInfo[], onProgress: (event: { type: 'tool_call_request' | 'tool_call_response' | 'tool_call_error' | 'tool_call_finish'; data: unknown }) => Promise<void>) => {
  const toolResponseParts = [];

  for (const fc of functionCalls) {
    const callId = fc.callId ?? `${fc.name}-${Date.now()}`;
    // 规范化参数名称 / Normalize parameter names
    const normalizedArgs = normalizeToolParams(fc.name, fc.args ?? {});
    const requestInfo = {
      callId,
      name: fc.name,
      args: normalizedArgs,
      isClientInitiated: false,
      prompt_id: fc.prompt_id,
    };
    await onProgress({
      type: 'tool_call_request',
      data: requestInfo,
    });
    const abortController = new AbortController();

    const toolResponse = await executeToolCall(config, requestInfo, abortController.signal);
    if (toolResponse?.response?.error) {
      await onProgress({
        type: 'tool_call_error',
        data: Object.assign({}, requestInfo, {
          status: 'error',
          error: `Error executing tool ${fc.name}: ${toolResponse.response.resultDisplay || toolResponse.response.error.message}`,
        }),
      });
      return;
    }
    await onProgress({
      type: 'tool_call_finish',
      data: Object.assign({}, requestInfo, {
        status: 'success',
      }),
    });

    if (toolResponse.response?.responseParts) {
      const parts = Array.isArray(toolResponse.response.responseParts) ? toolResponse.response.responseParts : [toolResponse.response.responseParts];
      for (const part of parts) {
        if (typeof part === 'string') {
          toolResponseParts.push({ text: part });
        } else if (part) {
          toolResponseParts.push(part);
        }
      }
    }
  }
  await onProgress({
    type: 'tool_call_finish',
    data: toolResponseParts,
  });
};

export const handleCompletedTools = (completedToolCallsFromScheduler: CompletedToolCall[], geminiClient: GeminiClient | null, performMemoryRefresh: () => void) => {
  const completedAndReadyToSubmitTools = completedToolCallsFromScheduler.filter((tc) => {
    const isTerminalState = tc.status === 'success' || tc.status === 'error' || tc.status === 'cancelled';
    if (isTerminalState) {
      const completedOrCancelledCall = tc;
      return completedOrCancelledCall.response?.responseParts !== undefined;
    }
    return false;
  });
  // Finalize any client-initiated tools as soon as they are done.
  const clientTools = completedAndReadyToSubmitTools.filter((t) => t.request.isClientInitiated);
  if (clientTools.length > 0) {
    // markToolsAsSubmitted(clientTools.map((t) => t.request.callId)); responseSubmittedToGemini=true
  }
  // Identify new, successful save_memory calls that we haven't processed yet.
  const newSuccessfulMemorySaves = completedAndReadyToSubmitTools.filter(
    (t) => t.request.name === 'save_memory' && t.status === 'success'
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
  const geminiTools = completedAndReadyToSubmitTools.filter((t) => !t.request.isClientInitiated);
  if (geminiTools.length === 0) {
    return;
  }
  // If all the tools were cancelled, don't submit a response to Gemini.
  const allToolsCancelled = geminiTools.every((tc) => tc.status === 'cancelled');
  if (allToolsCancelled) {
    if (geminiClient) {
      // We need to manually add the function responses to the history
      // so the model knows the tools were cancelled.
      const responsesToAdd = geminiTools.flatMap((toolCall) => toolCall.response.responseParts);
      for (const response of responsesToAdd) {
        let parts;
        if (Array.isArray(response)) {
          parts = response;
        } else if (typeof response === 'string') {
          parts = [{ text: response }];
        } else {
          parts = [response];
        }
        void geminiClient.addHistory({
          role: 'user',
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
  const responsesToSend = geminiTools.map((toolCall) => toolCall.response.responseParts);
  // const callIdsToMarkAsSubmitted = geminiTools.map(
  //   (toolCall) => toolCall.request.callId
  // );
  // markToolsAsSubmitted(callIdsToMarkAsSubmitted);

  function mergePartListUnions(list: unknown[]): unknown[] {
    const resultParts: unknown[] = [];
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

let promptCount = 0;

export const startNewPrompt = () => {
  promptCount++;
};

export const getPromptCount = () => {
  return promptCount;
};
