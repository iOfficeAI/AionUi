/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_IMAGE_EXTENSION, MIME_TO_EXT_MAP } from '@/common/constants';
import type { CompletedToolCall, Config, GeminiClient, ServerGeminiStreamEvent, ToolCallRequestInfo } from '@office-ai/aioncli-core';
import { executeToolCall, GeminiEventType as ServerGeminiEventType } from '@office-ai/aioncli-core';
import * as fs from 'fs';
import * as path from 'path';
import { parseAndFormatApiError } from './cli/errorParsing';
import { DEFAULT_STREAM_RESILIENCE_CONFIG, globalToolCallGuard, StreamMonitor, type StreamConnectionEvent, type StreamResilienceConfig } from './cli/streamResilience';

enum StreamProcessingStatus {
  Completed,
  UserCancelled,
  Error,
  HeartbeatTimeout,
  ConnectionLost,
}

// 流监控配置
export interface StreamMonitorOptions {
  config?: Partial<StreamResilienceConfig>;
  onConnectionEvent?: (event: StreamConnectionEvent) => void;
}

/**
 * Get file extension from MIME type (e.g., 'image/png' -> '.png')
 * 从 MIME 类型获取文件扩展名
 */
function getExtensionFromMimeType(mimeType: string): string {
  // Extract subtype from MIME type (e.g., 'image/png' -> 'png')
  const subtype = mimeType.split('/')[1]?.toLowerCase();
  if (subtype && MIME_TO_EXT_MAP[subtype]) {
    return MIME_TO_EXT_MAP[subtype];
  }
  return DEFAULT_IMAGE_EXTENSION;
}

/**
 * Save inline image data to a file and return the file path
 * 将内联图片数据保存到文件并返回文件路径
 */
async function saveInlineImage(mimeType: string, base64Data: string, workingDir: string): Promise<string> {
  const ext = getExtensionFromMimeType(mimeType);
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `gemini-img-${uniqueSuffix}${ext}`;
  const filePath = path.join(workingDir, fileName);

  const imageBuffer = Buffer.from(base64Data, 'base64');
  await fs.promises.writeFile(filePath, imageBuffer);

  return filePath;
}

/**
 * 处理 Gemini 流式事件（带弹性监控）
 * Process Gemini stream events with resilience monitoring
 *
 * @param stream - 原始流
 * @param config - 配置对象
 * @param onStreamEvent - 事件回调
 * @param monitorOptions - 流监控选项（可选）
 */
export const processGeminiStreamEvents = async (stream: AsyncIterable<ServerGeminiStreamEvent>, config: Config, onStreamEvent: (event: { type: ServerGeminiStreamEvent['type']; data: unknown }) => void, monitorOptions?: StreamMonitorOptions): Promise<StreamProcessingStatus> => {
  // 创建流监控器
  const monitorConfig = { ...DEFAULT_STREAM_RESILIENCE_CONFIG, ...monitorOptions?.config };
  const monitor = new StreamMonitor(monitorConfig, (event) => {
    // 处理连接状态变化
    if (event.type === 'state_change') {
      console.debug(`[StreamMonitor] State changed to: ${event.state}`, event.reason || '');
    } else if (event.type === 'heartbeat_timeout') {
      console.warn(`[StreamMonitor] Heartbeat timeout detected, last event: ${event.lastEventTime}`);
    }
    // 传递给外部监听器
    monitorOptions?.onConnectionEvent?.(event);
  });

  monitor.start();

  try {
    for await (const event of stream) {
      // 记录收到事件，更新心跳时间
      monitor.recordEvent();

      // 检查是否心跳超时（长时间无数据）
      if (monitor.isHeartbeatTimeout()) {
        console.warn('[StreamMonitor] Stream heartbeat timeout, connection may be stale');
        // 不立即中断，让上层处理决定
      }

      switch (event.type) {
        case ServerGeminiEventType.Thought:
          onStreamEvent({ type: event.type, data: (event as unknown as { value: unknown }).value });
          break;
        case ServerGeminiEventType.Content:
          {
            // Extract content value
            const contentValue = (event as unknown as { value: unknown }).value;
            const contentText = typeof contentValue === 'string' ? contentValue : '';

            // Check if content contains <think> or <thinking> tags (common in proxy services like newapi)
            // 检查内容是否包含 <think> 或 <thinking> 标签（中转站如 newapi 常见格式）
            const thinkTagRegex = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
            const hasThinkTags = /<think(?:ing)?>/i.test(contentText);

            if (hasThinkTags) {
              // Extract thinking content and emit as thought events
              // 提取思考内容并作为 thought 事件发送
              const thinkMatches = contentText.matchAll(thinkTagRegex);
              for (const match of thinkMatches) {
                const thinkContent = match[1]?.trim();
                if (thinkContent) {
                  onStreamEvent({
                    type: ServerGeminiEventType.Thought,
                    data: thinkContent,
                  });
                }
              }

              // Remove <think> and <thinking> tags from content and emit remaining content
              // 从内容中移除 <think> 和 <thinking> 标签，发送剩余内容
              const cleanedContent = contentText
                .replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, '')
                // Also remove unclosed tags at the end
                .replace(/<think(?:ing)?>[\s\S]*$/gi, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

              if (cleanedContent) {
                onStreamEvent({ type: event.type, data: cleanedContent });
              }
            } else {
              // No <think> tags, emit content as-is
              // 没有 <think> 标签，直接发送内容
              onStreamEvent({ type: event.type, data: contentValue });
            }
          }
          break;
        // InlineData: Handle inline image data from image generation models (e.g., gemini-3-pro-image)
        // 处理来自图片生成模型的内联图片数据（使用字符串字面量以兼容旧版本 aioncli-core）
        case 'inline_data' as ServerGeminiEventType:
          {
            const inlineData = (event as unknown as { value: { mimeType: string; data: string } }).value;
            if (inlineData?.mimeType && inlineData?.data) {
              try {
                const workingDir = config.getWorkingDir();
                const imagePath = await saveInlineImage(inlineData.mimeType, inlineData.data, workingDir);
                const relativePath = path.relative(workingDir, imagePath);
                // Emit as content with markdown image format for display
                onStreamEvent({
                  type: ServerGeminiEventType.Content,
                  data: `![Generated Image](${relativePath})`,
                });
              } catch (error) {
                console.error('[InlineData] Failed to save image:', error);
                onStreamEvent({
                  type: ServerGeminiEventType.Error,
                  data: `Failed to save generated image: ${error instanceof Error ? error.message : String(error)}`,
                });
              }
            }
          }
          break;
        case ServerGeminiEventType.ToolCallRequest:
          onStreamEvent({ type: event.type, data: (event as unknown as { value: unknown }).value });
          break;

        case ServerGeminiEventType.Error:
          {
            // Safely extract error value - event.value may be string, object with .error, or undefined
            const errorEvent = event as unknown as { value?: { error?: unknown } | unknown };
            const errorValue = (errorEvent.value as { error?: unknown })?.error ?? errorEvent.value ?? 'Unknown error occurred';
            onStreamEvent({
              type: event.type,
              data: parseAndFormatApiError(errorValue, config.getContentGeneratorConfig().authType),
            });
          }
          break;
        case ServerGeminiEventType.Finished:
          {
            // 传递 Finished 事件，包含 token 使用统计
            onStreamEvent({ type: event.type, data: (event as unknown as { value: unknown }).value });
          }
          break;
        case ServerGeminiEventType.ContextWindowWillOverflow:
          {
            // Handle context window overflow - extract token counts for user-friendly message
            const overflowEvent = event as {
              type: string;
              value: { estimatedRequestTokenCount: number; remainingTokenCount: number };
            };
            const estimated = overflowEvent.value?.estimatedRequestTokenCount || 0;
            const remaining = overflowEvent.value?.remainingTokenCount || 0;
            const estimatedK = Math.round(estimated / 1000);
            const remainingK = Math.round(remaining / 1000);

            onStreamEvent({
              type: ServerGeminiEventType.Error,
              data: `Context window overflow: Request size (${estimatedK}K tokens) exceeds model capacity (${remainingK}K tokens). Try: 1) Start a new conversation, 2) Reduce workspace files, 3) Clear conversation history, or 4) Use smaller files.`,
            });
          }
          break;
        case ServerGeminiEventType.AgentExecutionStopped: {
          const reason = (event as { value?: { reason?: string } }).value?.reason;
          onStreamEvent({
            type: ServerGeminiEventType.Error,
            data: `Agent execution stopped${reason ? `: ${reason}` : ''}.`,
          });
          break;
        }
        case ServerGeminiEventType.AgentExecutionBlocked: {
          const reason = (event as { value?: { reason?: string } }).value?.reason;
          onStreamEvent({
            type: ServerGeminiEventType.Error,
            data: `Agent execution blocked${reason ? `: ${reason}` : ''}.`,
          });
          break;
        }
        case ServerGeminiEventType.Retry:
          onStreamEvent({
            type: ServerGeminiEventType.Error,
            data: 'Request is being retried after a temporary failure. Please wait…',
          });
          break;
        case ServerGeminiEventType.InvalidStream:
          // InvalidStream indicates the model returned invalid content (empty response, no finish reason, etc.)
          // This is typically a transient issue - we emit a special event type so the caller can implement retry
          // InvalidStream 表示模型返回了无效内容（空响应、无结束原因等）
          // 这通常是临时问题 - 我们发出特殊事件类型，以便调用方可以实现重试
          onStreamEvent({
            type: 'invalid_stream' as ServerGeminiEventType,
            data: {
              message: 'Invalid response stream detected. Retrying...',
              retryable: true,
            },
          });
          break;
        case ServerGeminiEventType.ChatCompressed:
        case ServerGeminiEventType.UserCancelled:
        case ServerGeminiEventType.ToolCallConfirmation:
        case ServerGeminiEventType.ToolCallResponse:
        case ServerGeminiEventType.MaxSessionTurns:
        case ServerGeminiEventType.LoopDetected:
        case ServerGeminiEventType.ModelInfo:
          // These event types are handled silently or are informational only
          // ModelInfo: Contains the model name being used (e.g., 'gemini-3-pro-image')
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

    // 流正常结束
    monitor.stop();
    return StreamProcessingStatus.Completed;
  } catch (error) {
    // 流处理出错
    const errorMessage = error instanceof Error ? error.message : String(error);
    monitor.markFailed(errorMessage);

    // 检查是否是连接相关错误
    if (errorMessage.includes('fetch failed') || errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('ECONNRESET') || errorMessage.includes('socket hang up')) {
      console.error('[StreamMonitor] Connection error detected:', errorMessage);
      return StreamProcessingStatus.ConnectionLost;
    }

    // 重新抛出其他错误
    throw error;
  } finally {
    // 确保监控器停止
    monitor.stop();
  }
};

/**
 * 规范化工具参数名称
 * 某些模型可能返回不同的参数名称，需要映射到工具期望的标准名称
 * Normalize tool parameter names - some models may return different param names
 */
const normalizeToolParams = (toolName: string, args: Record<string, unknown>): Record<string, unknown> => {
  const normalized = { ...args };

  // Strip leading "@" for file references (users often write @file.ext)
  if (typeof normalized.file_path === 'string' && normalized.file_path.startsWith('@')) {
    normalized.file_path = normalized.file_path.slice(1);
  }
  if (typeof normalized.path === 'string' && normalized.path.startsWith('@')) {
    normalized.path = normalized.path.slice(1);
  }

  // 文件操作工具：将 path 映射到 file_path
  // File operation tools: map 'path' to 'file_path'
  const fileTools = ['ReadFileTool', 'WriteFileTool', 'EditTool', 'read_file', 'write_file', 'edit'];
  if (fileTools.includes(toolName) && 'path' in normalized && !('file_path' in normalized)) {
    normalized.file_path = normalized.path;
    delete normalized.path;
  }

  // 目录操作相关工具：兼容旧版本模型输出的 path/directory 字段
  // Directory-related tools: normalize legacy keys (path/directory) to dir_path
  const dirPathTools = ['list_directory', 'glob', 'search_file_content', 'run_shell_command'];
  if (dirPathTools.includes(toolName)) {
    const dirLikeKeys = ['dir_path', 'path', 'directory_path', 'directory', 'dir', 'folder_path', 'folder'];
    for (const key of dirLikeKeys) {
      if (key in normalized && typeof normalized[key] === 'string' && normalized[key]) {
        if (!('dir_path' in normalized) && key !== 'dir_path') {
          normalized.dir_path = normalized[key];
        }
        if (key !== 'dir_path') {
          delete normalized[key];
        }
      }
    }

    // 新版 core 要求 list_directory 必填 dir_path，这里缺省时默认当前目录
    // aioncli-core now requires dir_path; default to workspace root when missing
    if (toolName === 'list_directory' && (typeof normalized.dir_path !== 'string' || normalized.dir_path.length === 0)) {
      normalized.dir_path = '.';
    }
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

/**
 * 处理已完成的工具调用（带保护机制）
 * Handle completed tool calls with protection mechanism
 *
 * 改进点：
 * 1. 使用 globalToolCallGuard 保护正在执行的工具调用
 * 2. 受保护的工具调用不会被误判为 cancelled
 * 3. 工具完成后自动移除保护
 */
export const handleCompletedTools = (completedToolCallsFromScheduler: CompletedToolCall[], geminiClient: GeminiClient | null, performMemoryRefresh: () => void) => {
  const completedAndReadyToSubmitTools = completedToolCallsFromScheduler.filter((tc) => {
    const isTerminalState = tc.status === 'success' || tc.status === 'error' || tc.status === 'cancelled';
    if (isTerminalState) {
      const completedOrCancelledCall = tc;
      // 标记工具完成，移除保护
      // Mark tool as complete, remove protection
      if (tc.status === 'success' || tc.status === 'error') {
        globalToolCallGuard.complete(tc.request.callId);
      }
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

  // 检查是否所有工具都被取消（排除受保护的工具）
  // Check if all tools were cancelled (excluding protected tools)
  const allToolsCancelled = geminiTools.every((tc) => {
    // 如果工具仍在保护中，不认为是被取消
    // If tool is still protected, don't consider it cancelled
    if (globalToolCallGuard.isProtected(tc.request.callId)) {
      console.debug(`[ToolCallGuard] Tool ${tc.request.callId} is protected, not treating as cancelled`);
      return false;
    }
    return tc.status === 'cancelled';
  });
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
