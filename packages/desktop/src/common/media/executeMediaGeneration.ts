/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Media generation entry point: resolve the catalog spec, clip parameters to
 * what the model supports, dispatch to the matching adapter, and normalize the
 * outcome text (paths only — never bytes).
 *
 * Called by the built-in MCP server today (in-process). In phase 2 this moves
 * behind the main-process MediaJobService without changing its contract.
 */

import type { TProviderWithModel } from '@/common/config/storage';
import { getMediaAdapter } from './adapters';
import { clipParamsToSpec, EXECUTABLE_FORMS, resolveMediaModelSpec } from './catalog/resolve';
import type { MediaGenOutcome, MediaGenParams, MediaKind, MediaProgressUpdate } from './types';
import * as fs from 'fs';
import * as path from 'path';

export type ExecuteMediaGenerationInput = {
  kind: MediaKind;
  prompt: string;
  params?: MediaGenParams;
  inputUris?: string[];
  provider: TProviderWithModel;
  workspaceDir: string;
  proxy?: string;
  signal?: AbortSignal;
  onProgress?: (update: MediaProgressUpdate) => void;
};

export async function executeMediaGeneration(input: ExecuteMediaGenerationInput): Promise<MediaGenOutcome> {
  const { kind, prompt, provider, proxy, signal, onProgress } = input;
  const requestedParams = input.params ?? {};
  const inputUris = input.inputUris ?? [];

  // Resolve and validate workspaceDir once, before any adapter touches the
  // filesystem. `workspaceDir` itself is trusted (the MCP server always passes
  // its own process cwd — see builtinMcp/imageGenServer.ts — never a value
  // read from the tool call), but it still has to exist and be a directory
  // before every downstream containment check (`resolveSafePath`) can mean
  // anything.
  const workspaceDir = path.resolve(input.workspaceDir);
  let workspaceStat: fs.Stats;
  try {
    workspaceStat = await fs.promises.stat(workspaceDir);
  } catch {
    return {
      success: false,
      assets: [],
      text: `Error: workspace directory not found: ${workspaceDir}`,
      error: 'workspace-not-found',
    };
  }
  if (!workspaceStat.isDirectory()) {
    return {
      success: false,
      assets: [],
      text: `Error: workspace path is not a directory: ${workspaceDir}`,
      error: 'workspace-not-directory',
    };
  }

  const spec = resolveMediaModelSpec(kind, provider, provider.use_model);

  // No catalog match → Form B fallback for images. This is the compatibility
  // net: any provider/model that worked before the catalog existed keeps
  // working exactly as it did.
  const form = spec?.form ?? (kind === 'image' ? 'B' : undefined);
  if (!form) {
    return {
      success: false,
      assets: [],
      text: `Error: model "${provider.use_model}" is not recognized as a ${kind} generation model. Select a supported model in Settings > Tools.`,
      error: 'unsupported-model',
    };
  }

  if (!EXECUTABLE_FORMS.includes(form)) {
    return {
      success: false,
      assets: [],
      text: `Error: model "${provider.use_model}" uses an async task API that is not supported yet (coming with the media job engine). Select a synchronous model in Settings > Tools for now.`,
      error: 'form-not-executable',
    };
  }

  const adapter = getMediaAdapter(form);
  if (!adapter) {
    return {
      success: false,
      assets: [],
      text: `Error: no adapter available for API form "${form}".`,
      error: 'no-adapter',
    };
  }

  const { params, dropped } = clipParamsToSpec(requestedParams, spec);

  const outcome = await adapter.generate({
    kind,
    prompt,
    params,
    inputUris,
    provider,
    spec,
    workspaceDir,
    proxy,
    signal,
    onProgress,
  });

  // Surface asset paths in the text (agent-facing contract: keep the
  // "Generated image saved to:" line existing prompts rely on) and report any
  // clipped parameters so agents don't retry them blindly.
  if (outcome.success && outcome.assets.length > 0) {
    const lines = outcome.assets.map((asset) => `Generated ${asset.kind} saved to: ${asset.filePath}`);
    outcome.text = `${outcome.text}\n\n${lines.join('\n')}`;
  }
  if (dropped.length > 0) {
    outcome.droppedParams = dropped;
    outcome.text = `${outcome.text}\n\nNote: parameter(s) ${dropped.join(', ')} are not supported by model "${provider.use_model}" and were ignored. Do not retry with these parameters.`;
  }

  return outcome;
}
