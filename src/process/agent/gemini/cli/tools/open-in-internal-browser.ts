/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Type } from '@google/genai';
import type {
  ToolResult,
  ToolInvocation,
  ToolLocation,
  ToolCallConfirmationDetails,
  MessageBus,
} from '@office-ai/aioncli-core';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from '@office-ai/aioncli-core';

export interface OpenInternalBrowserToolParams {
  /** Fully-qualified URL to open inside the AionUi element-reference browser. */
  url: string;
}

export type OpenInternalBrowserEmitter = (event: { type: 'open_internal_browser'; data: { url: string } }) => void;

const TOOL_DESCRIPTION = [
  'Open a URL inside the AionUi *internal* element-reference browser (the in-app webview that lets the user pick DOM elements and feed them back into this chat).',
  '',
  'Prefer this over running shell commands like `open`, `xdg-open`, or `start` whenever:',
  ' - The URL points at a local dev server you just started (e.g. http://localhost:3000).',
  ' - The user is likely to want to inspect or reference DOM elements from the page in this conversation.',
  '',
  'After calling this tool, control returns to you immediately; the page opens in the side panel and the user can pick elements to attach as context.',
].join('\n');

export class OpenInternalBrowserTool extends BaseDeclarativeTool<OpenInternalBrowserToolParams, ToolResult> {
  static readonly Name: string = 'aionui_open_internal_browser';

  constructor(
    private readonly emit: OpenInternalBrowserEmitter,
    messageBus: MessageBus
  ) {
    super(
      OpenInternalBrowserTool.Name,
      'OpenInternalBrowser',
      TOOL_DESCRIPTION,
      Kind.Other,
      {
        type: Type.OBJECT,
        properties: {
          url: {
            type: Type.STRING,
            description:
              'Fully-qualified URL to open (http:// or https://). Localhost dev servers are the primary use case.',
          },
        },
        required: ['url'],
      },
      messageBus,
      true,
      false
    );
  }

  public override validateToolParams(params: OpenInternalBrowserToolParams): string | null {
    if (!params.url || params.url.trim() === '') {
      return "The 'url' parameter cannot be empty.";
    }
    if (!/^https?:\/\//i.test(params.url)) {
      return "The 'url' must start with http:// or https://.";
    }
    return null;
  }

  protected createInvocation(
    params: OpenInternalBrowserToolParams,
    messageBus: MessageBus
  ): ToolInvocation<OpenInternalBrowserToolParams, ToolResult> {
    return new OpenInternalBrowserInvocation(this.emit, params, messageBus);
  }
}

class OpenInternalBrowserInvocation extends BaseToolInvocation<OpenInternalBrowserToolParams, ToolResult> {
  constructor(
    private readonly emit: OpenInternalBrowserEmitter,
    params: OpenInternalBrowserToolParams,
    messageBus: MessageBus
  ) {
    super(params, messageBus);
  }

  getDescription(): string {
    return `Open ${this.params.url} in the internal element-reference browser`;
  }

  override toolLocations(): ToolLocation[] {
    return [];
  }

  override async shouldConfirmExecute(): Promise<ToolCallConfirmationDetails | false> {
    return false;
  }

  async execute(): Promise<ToolResult> {
    try {
      this.emit({ type: 'open_internal_browser', data: { url: this.params.url } });
      return {
        llmContent: `Opened ${this.params.url} in the AionUi internal element-reference browser. The user can now pick DOM elements from the page to feed back into this chat. Do not invoke an external browser for the same URL.`,
        returnDisplay: `Opened in internal browser: ${this.params.url}`,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        llmContent: `Failed to open internal browser: ${message}`,
        returnDisplay: `Failed to open internal browser: ${message}`,
      };
    }
  }
}
