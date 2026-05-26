/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';

/** SWR key for remote agent model info (keyed by `remote:<agentId>`) */
export const REMOTE_AGENT_MODELS_SWR_KEY = 'remote-agent-models';

/**
 * Fetcher for {@link REMOTE_AGENT_MODELS_SWR_KEY}.
 *
 * Iterates all registered remote agents and asks aioncore for each one's
 * model list (`GET /api/remote-agents/{id}/models`).  aioncore performs the
 * upstream call to the OpenCode daemon's `/provider` endpoint because it
 * holds the decrypted `auth_token` — the plaintext is never exposed to
 * the renderer.
 *
 * Non-OpenCode agents (protocol !== 'acp' here historically means OpenCode
 * remote, see `manager/remote/agent.rs`) are skipped server-side with a
 * BadRequest; we silently ignore the failure here.
 */
export async function fetchRemoteAgentModels(): Promise<Record<string, AcpModelInfo>> {
  const agents = await ipcBridge.remoteAgent.list.invoke();
  const results: Record<string, AcpModelInfo> = {};

  const fetches = (agents || []).map(async (agent) => {
    // Only OpenCode remote agents expose a `/provider` listing.
    // OpenClaw / ZeroClaw / ACP use a different model-discovery path.
    if (agent.protocol !== 'opencode') return;

    try {
      const modelInfo = await ipcBridge.remoteAgent.refreshModels.invoke({ id: agent.id });
      if (modelInfo && modelInfo.available_models.length > 0) {
        results[`remote:${agent.id}`] = modelInfo;
      }
    } catch {
      // Silently skip unreachable / misconfigured agents — the model
      // selector will fall back to the "Default model" tooltip.
    }
  });

  await Promise.all(fetches);
  return results;
}
