/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ToolInvocation<TParams = any, TResult = any> {
  execute(signal: AbortSignal): Promise<TResult>;
  getDescription(): string;
}

export interface ToolResult {
  llmContent: string;
  returnDisplay?: string;
  error?: {
    message: string;
    type: string;
  };
}

export enum Kind {
  Search = 'search',
  // Add other kinds as needed
}

export abstract class BaseToolInvocation<TParams, TResult> implements ToolInvocation<TParams, TResult> {
  constructor(protected params: TParams) {}

  abstract execute(signal: AbortSignal): Promise<TResult>;
  abstract getDescription(): string;
}

export abstract class BaseDeclarativeTool<TParams, TResult> {
  constructor(
    public readonly name: string,
    public readonly displayName: string,
    public readonly description: string,
    public readonly kind: Kind,
    public readonly schema: any
  ) {}

  protected abstract validateToolParamValues(params: TParams): string | null;
  protected abstract createInvocation(params: TParams): ToolInvocation<TParams, TResult>;

  build(params: TParams): ToolInvocation<TParams, TResult> {
    const validation = this.validateToolParamValues(params);
    if (validation) {
      throw new Error(validation);
    }
    return this.createInvocation(params);
  }
}
