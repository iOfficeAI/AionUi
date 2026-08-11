/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_JS_FILTER_SCRIPT } from '@/common/apiCallback';
import type { IApiConfig } from '@/common/config/storage';
import { Script, createContext } from 'vm';

type CallbackTemplateVariables = Record<string, unknown> & {
  conversationHistory?: unknown;
  lastMessage?: unknown;
  model?: unknown;
  sessionId?: unknown;
  workspace?: unknown;
};

type CallbackJsFilterObjectResult = {
  content?: unknown;
  textLimit?: unknown;
};

type CallbackJsFilterResult = {
  content: string;
  textLimit: number;
};

type CallbackApiJsonResponse = {
  errcode?: unknown;
  errmsg?: unknown;
  code?: unknown;
  msg?: unknown;
  message?: unknown;
  StatusCode?: unknown;
  StatusMessage?: unknown;
};

/**
 * Service for sending HTTP callbacks
 * HTTP 回调发送服务
 */
export class CallbackService {
  /**
   * Replace template variables in JSON string
   * 替换 JSON 字符串中的模板变量
   *
   * Supported variables:
   * - {{conversationHistory}} - Array of messages
   * - {{sessionId}} - Conversation ID
   * - {{workspace}} - Workspace path
   * - {{model}} - Model information
   * - {{lastMessage}} - Last message object
   */
  static replaceVariables(template: string, variables: Record<string, unknown>): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      if (typeof value === 'string') {
        result = this.replaceStringVariable(result, placeholder, value);
        continue;
      }

      const replacement = JSON.stringify(value ?? null);
      result = this.replaceLiteral(result, placeholder, replacement);
    }

    return result;
  }

  private static replaceStringVariable(template: string, placeholder: string, value: string): string {
    const escapedValue = JSON.stringify(value);
    const quotedPlaceholder = `"${placeholder}"`;
    const withQuotedReplacement = this.replaceLiteral(template, quotedPlaceholder, escapedValue);
    return this.replaceLiteral(withQuotedReplacement, placeholder, escapedValue);
  }

  private static replaceLiteral(template: string, searchValue: string, replacement: string): string {
    return template.split(searchValue).join(replacement);
  }

  static createTemplateVariables(config: IApiConfig, variables: CallbackTemplateVariables): Record<string, unknown> {
    const jsFilterResult = this.buildJsFilterResult(config, variables);

    return {
      ...variables,
      ...this.createJsFitterVariables(jsFilterResult, jsFilterResult.content, 1, 1),
    };
  }

  private static buildJsFilterResult(config: IApiConfig, variables: CallbackTemplateVariables): CallbackJsFilterResult {
    if (!config.jsFilterEnabled) {
      return {
        content: '',
        textLimit: -1,
      };
    }

    const scriptSource = config.jsFilterScript?.trim() || DEFAULT_JS_FILTER_SCRIPT;
    const input = {
      sessionId: typeof variables.sessionId === 'string' ? variables.sessionId : '',
      workspace: typeof variables.workspace === 'string' ? variables.workspace : '',
      model: variables.model ?? null,
      lastMessage: variables.lastMessage ?? null,
      conversationHistory: Array.isArray(variables.conversationHistory) ? variables.conversationHistory : [],
    };

    try {
      const context = createContext({ input });
      const script = new Script(`
${scriptSource}

if (typeof jsFilter !== 'function') {
  throw new Error('Callback JS filter must define a jsFilter(input) function');
}

jsFilter(input);
`);
      const result = script.runInContext(context, { timeout: 1000 });
      return this.normalizeJsFilterResult(result);
    } catch (error) {
      console.error('[CallbackService] Failed to execute callback JS filter:', error);
      return {
        content: '',
        textLimit: -1,
      };
    }
  }

  private static normalizeJsFilterResult(result: unknown): CallbackJsFilterResult {
    if (typeof result === 'string') {
      return {
        content: result,
        textLimit: -1,
      };
    }

    if (result && typeof result === 'object') {
      const objectResult = result as CallbackJsFilterObjectResult;
      return {
        content: String(objectResult.content ?? ''),
        textLimit: this.normalizeTextLimit(objectResult.textLimit),
      };
    }

    return {
      content: String(result ?? ''),
      textLimit: -1,
    };
  }

  private static normalizeTextLimit(textLimit: unknown): number {
    if (typeof textLimit === 'number' && Number.isFinite(textLimit)) {
      return textLimit > 0 ? Math.floor(textLimit) : -1;
    }

    if (typeof textLimit === 'string' && textLimit.trim()) {
      const parsed = Number(textLimit);
      if (Number.isFinite(parsed)) {
        return parsed > 0 ? Math.floor(parsed) : -1;
      }
    }

    return -1;
  }

  private static createJsFitterVariables(
    jsFilterResult: CallbackJsFilterResult,
    chunkContent: string,
    chunkIndex: number,
    chunkCount: number
  ): Record<string, unknown> {
    return {
      jsFitterStr: chunkContent,
      jsFitterFullStr: jsFilterResult.content,
      jsFitterTextLimit: jsFilterResult.textLimit,
      jsFitterChunkIndex: chunkIndex,
      jsFitterChunkCount: chunkCount,
    };
  }

  private static splitCallbackContent(content: string, textLimit: number): string[] {
    if (textLimit <= 0 || content.length <= textLimit) {
      return [content];
    }

    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= textLimit) {
        chunks.push(remaining);
        break;
      }

      let splitIndex = textLimit;
      const searchStart = Math.floor(textLimit * 0.8);
      const lastNewline = remaining.lastIndexOf('\n', textLimit);

      if (lastNewline > searchStart) {
        splitIndex = lastNewline + 1;
      } else {
        const lastSpace = remaining.lastIndexOf(' ', textLimit);
        if (lastSpace > searchStart) {
          splitIndex = lastSpace + 1;
        }
      }

      const chunk = remaining.slice(0, splitIndex).trim();
      if (!chunk) {
        chunks.push(remaining.slice(0, textLimit));
        remaining = remaining.slice(textLimit);
        continue;
      }

      chunks.push(chunk);
      remaining = remaining.slice(splitIndex).trim();
    }

    return chunks.length > 0 ? chunks : [content];
  }

  private static async validateCallbackResponse(
    response: Response,
    chunkIndex: number,
    chunkCount: number
  ): Promise<string | null> {
    if (!response.ok) {
      const responseDetail = await this.extractErrorResponseDetail(response);
      const baseError = `HTTP ${response.status}: ${response.statusText}`;
      return chunkCount > 1
        ? `${baseError}${responseDetail ? ` - ${responseDetail}` : ''} (chunk ${chunkIndex}/${chunkCount})`
        : `${baseError}${responseDetail ? ` - ${responseDetail}` : ''}`;
    }

    const contentType = response.headers?.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('application/json')) {
      return null;
    }

    let responseText = '';
    try {
      responseText = await response.text();
    } catch {
      return null;
    }

    if (!responseText.trim()) {
      return null;
    }

    try {
      const parsed = JSON.parse(responseText) as CallbackApiJsonResponse;
      const errcode =
        typeof parsed.errcode === 'number'
          ? parsed.errcode
          : typeof parsed.errcode === 'string'
            ? Number(parsed.errcode)
            : 0;

      if (Number.isFinite(errcode) && errcode !== 0) {
        const errmsg = typeof parsed.errmsg === 'string' && parsed.errmsg.trim() ? parsed.errmsg.trim() : 'Unknown';
        return chunkCount > 1
          ? `Callback API rejected request with errcode ${errcode}: ${errmsg} (chunk ${chunkIndex}/${chunkCount})`
          : `Callback API rejected request with errcode ${errcode}: ${errmsg}`;
      }
    } catch {
      return null;
    }

    return null;
  }

  private static async extractErrorResponseDetail(response: Response): Promise<string | null> {
    let responseText = '';
    try {
      responseText = await response.text();
    } catch {
      return null;
    }

    const trimmed = responseText.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed) as CallbackApiJsonResponse;
      const codeCandidates = [parsed.errcode, parsed.code, parsed.StatusCode];
      const messageCandidates = [parsed.errmsg, parsed.msg, parsed.message, parsed.StatusMessage];

      const code = codeCandidates.find((value) => typeof value === 'number' || typeof value === 'string');
      const message = messageCandidates.find((value) => typeof value === 'string' && value.trim());

      if (typeof code === 'number' || typeof code === 'string') {
        if (typeof message === 'string' && message.trim()) {
          return `code ${String(code)}: ${message.trim()}`;
        }
        return `code ${String(code)}`;
      }

      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
    } catch {
      // Fall back to raw body below when response is not JSON.
    }

    return trimmed.length > 300 ? `${trimmed.slice(0, 300)}...` : trimmed;
  }

  /**
   * Send HTTP callback request
   * 发送 HTTP 回调请求
   */
  static async sendCallback(
    config: IApiConfig,
    variables: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    if (!config.callbackEnabled || !config.callbackUrl) {
      return { success: false, error: 'Callback URL not configured' };
    }

    try {
      const jsFilterResult = this.buildJsFilterResult(config, variables);
      const chunks = this.splitCallbackContent(jsFilterResult.content, jsFilterResult.textLimit);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...config.callbackHeaders,
      };

      for (const [index, chunk] of chunks.entries()) {
        const templateVariables = {
          ...variables,
          ...this.createJsFitterVariables(jsFilterResult, chunk, index + 1, chunks.length),
        };

        let body: string | undefined;
        if (config.callbackBody) {
          body = this.replaceVariables(config.callbackBody, templateVariables);
        }

        const response = await fetch(config.callbackUrl, {
          method: config.callbackMethod,
          headers,
          body: config.callbackMethod !== 'GET' ? body : undefined,
          signal: AbortSignal.timeout(30000),
        });

        const errorMsg = await this.validateCallbackResponse(response, index + 1, chunks.length);
        if (errorMsg) {
          console.error(`[CallbackService] Callback failed -`, errorMsg);
          return { success: false, error: errorMsg };
        }
      }

      console.log(
        `[CallbackService] Callback sent successfully to ${config.callbackUrl}${
          chunks.length > 1 ? ` (${chunks.length} chunks)` : ''
        }`
      );
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[CallbackService] Callback failed:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }
}
