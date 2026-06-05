/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type EmbeddingProviderConfig = {
  providerId: string;
  model: string;
  dimensions: number;
  apiKeyEnvVar?: string;
  baseUrl?: string;
};

export interface IEmbeddingProvider {
  readonly config: EmbeddingProviderConfig;
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}
