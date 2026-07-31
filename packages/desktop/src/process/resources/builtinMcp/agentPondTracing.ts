/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  configFromRuntimeEnv,
  sinkFromStore,
  type IngestionSink,
  type ObjectStore,
  type ObjectStoreIngestionSinkOptions,
} from '@agentpond/core';
import { AgentPondSpanExporter } from '@agentpond/otel';
import { OpenAIInstrumentation } from '@arizeai/openinference-instrumentation-openai';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Files } from 'files-sdk';
import { fs } from 'files-sdk/fs';
import OpenAI from 'openai';

let tracerProvider: NodeTracerProvider | undefined;

export let agentPondTracingEnabled = false;

class LocalFilesObjectStore implements ObjectStore {
  constructor(private readonly files: Pick<Files, 'download' | 'listAll' | 'upload'>) {}

  toSink(options?: ObjectStoreIngestionSinkOptions): IngestionSink {
    return sinkFromStore(this, options);
  }

  async putJson(key: string, value: unknown): Promise<void> {
    const json = JSON.stringify(value);
    if (json === undefined) {
      throw new Error(`Object "${key}" is not JSON serializable`);
    }
    await this.files.upload(key, json, { contentType: 'application/json' });
  }

  async getJson<T>(key: string): Promise<T> {
    return JSON.parse(await (await this.files.download(key)).text()) as T;
  }

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    for await (const file of this.files.listAll({ prefix })) {
      keys.push(file.key);
    }
    return keys.sort();
  }
}

if (process.env.FILES_SDK_PROVIDER) {
  try {
    if (process.env.FILES_SDK_PROVIDER !== 'fs') {
      throw new Error('The bundled image generation server supports FILES_SDK_PROVIDER=fs');
    }

    const root = process.env.FILES_SDK_ROOT?.trim();
    if (!root) {
      throw new Error('FILES_SDK_ROOT is required when FILES_SDK_PROVIDER=fs');
    }

    const config = configFromRuntimeEnv();
    const exporter = new AgentPondSpanExporter({
      store: new LocalFilesObjectStore(new Files({ adapter: fs({ root }) })),
      projectId: config.projectId,
      prefix: config.prefix,
    });
    tracerProvider = new NodeTracerProvider({
      spanProcessors: [new BatchSpanProcessor(exporter)],
    });
    tracerProvider.register();

    const instrumentation = new OpenAIInstrumentation({
      tracerProvider,
      traceConfig: {
        hideInputs: true,
        hideOutputs: true,
      },
    });
    instrumentation.manuallyInstrument(OpenAI);
    agentPondTracingEnabled = true;
  } catch (error) {
    console.warn(
      '[ImageGenMCP] AgentPond tracing is disabled:',
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function flushAgentPondTracing(): Promise<void> {
  if (!tracerProvider) return;

  try {
    await tracerProvider.forceFlush();
  } catch (error) {
    console.warn(
      '[ImageGenMCP] Failed to flush AgentPond traces:',
      error instanceof Error ? error.message : String(error)
    );
  }
}
