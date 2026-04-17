/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import { agentRegistry } from '@process/agent/AgentRegistry';
import { getDatabase } from '@process/services/database';
import { generateIdentity } from '@process/agent/openclaw/deviceIdentity';
import { OpenClawGatewayConnection } from '@process/agent/openclaw/OpenClawGatewayConnection';
import WebSocket from 'ws';

/**
 * Normalize and validate a WebSocket URL.
 * Prepends `ws://` when no protocol is provided so that bare host:port strings
 * (e.g. "127.0.0.1:42617") work, then enforces ws/wss protocol to prevent
 * SSRF via other schemes.
 *
 * @returns the validated URL string, or `null` together with an error message.
 */
function validateWebSocketUrl(url: string): { url: string } | { error: string } {
  try {
    const trimmed = url.trim();
    const hasScheme = /^[a-z][a-z0-9+\-.]*:\/\//i.test(trimmed);
    const raw = hasScheme ? trimmed : `ws://${trimmed}`;
    const parsed = new URL(raw);
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      return { error: `Unsupported protocol: ${parsed.protocol}` };
    }
    return { url: parsed.toString() };
  } catch {
    return { error: 'Invalid URL' };
  }
}

export function initRemoteAgentBridge(): void {
  ipcBridge.remoteAgent.list.provider(async () => {
    const db = await getDatabase();
    return db.getRemoteAgents();
  });

  ipcBridge.remoteAgent.get.provider(async ({ id }) => {
    const db = await getDatabase();
    return db.getRemoteAgent(id);
  });

  ipcBridge.remoteAgent.create.provider(async (input) => {
    const db = await getDatabase();
    const now = Date.now();

    // Generate independent device identity for OpenClaw protocol agents
    const device =
      input.protocol === 'openclaw'
        ? generateIdentity()
        : { deviceId: undefined, publicKeyPem: undefined, privateKeyPem: undefined };

    const config = {
      ...input,
      id: uuid(),
      deviceId: device.deviceId,
      devicePublicKey: device.publicKeyPem,
      devicePrivateKey: device.privateKeyPem,
      status: 'unknown' as const,
      createdAt: now,
      updatedAt: now,
    };
    const result = db.createRemoteAgent(config);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to create remote agent');
    }
    // Sync AgentRegistry so getDetectedAgents() includes the new remote agent
    agentRegistry.refreshRemoteAgents().catch(() => {});
    return result.data;
  });

  ipcBridge.remoteAgent.update.provider(async ({ id, updates }) => {
    const db = await getDatabase();
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.protocol !== undefined) dbUpdates.protocol = updates.protocol;
    if (updates.url !== undefined) dbUpdates.url = updates.url;
    if (updates.authType !== undefined) dbUpdates.auth_type = updates.authType;
    if (updates.authToken !== undefined) dbUpdates.auth_token = updates.authToken;
    if (updates.avatar !== undefined) dbUpdates.avatar = updates.avatar;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.allowInsecure !== undefined) dbUpdates.allow_insecure = updates.allowInsecure ? 1 : 0;
    const result = db.updateRemoteAgent(id, dbUpdates);
    return result.success;
  });

  ipcBridge.remoteAgent.delete.provider(async ({ id }) => {
    const db = await getDatabase();
    const result = db.deleteRemoteAgent(id);
    if (result.success) {
      // Sync AgentRegistry so deleted remote agent is removed from detection
      agentRegistry.refreshRemoteAgents().catch(() => {});
    }
    return result.success;
  });

  ipcBridge.remoteAgent.testConnection.provider(async ({ url, authType, authToken, allowInsecure }) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      // Normalize & validate URL: prepend ws:// when no protocol is provided
      // so that bare host:port strings (e.g. "127.0.0.1:42617") work, then
      // enforce ws/wss protocol to prevent SSRF via other schemes.
      const validated = validateWebSocketUrl(url);
      if ('error' in validated) {
        resolve({ success: false, error: validated.error });
        return;
      }
      const wsUrl = validated.url;

      let settled = false;
      let ws: WebSocket | undefined;
      const headers: Record<string, string> = {};
      if (authType === 'bearer' && authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const finish = (result: { success: boolean; error?: string }) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        ws?.close();
        resolve(result);
      };

      const timeout = setTimeout(() => {
        finish({ success: false, error: 'Connection timed out (10s)' });
      }, 10_000);

      try {
        ws = new WebSocket(wsUrl, {
          headers,
          handshakeTimeout: 10_000,
          rejectUnauthorized: !allowInsecure,
        });
      } catch (error) {
        finish({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      ws.on('open', () => {
        finish({ success: true });
      });

      ws.on('error', (err) => {
        finish({ success: false, error: err.message });
      });
    });
  });

  ipcBridge.remoteAgent.handshake.provider(async ({ id }) => {
    console.log('[RemoteAgent] handshake start, agentId:', id);
    const db = await getDatabase();
    const agent = db.getRemoteAgent(id);
    if (!agent) {
      console.log('[RemoteAgent] handshake abort: agent not found');
      return { status: 'error' as const, error: 'Remote agent not found' };
    }

    if (agent.protocol !== 'openclaw') {
      return { status: 'ok' as const };
    }

    console.log('[RemoteAgent] handshake connecting to', agent.url, 'hasDeviceToken:', !!agent.deviceToken);
    return new Promise<{ status: 'ok' | 'pending_approval' | 'error'; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        conn.stop();
        resolve({ status: 'error', error: 'Handshake timed out (15s)' });
      }, 15_000);

      const conn = new OpenClawGatewayConnection({
        url: agent.url,
        rejectUnauthorized: !agent.allowInsecure,
        token: agent.authType === 'bearer' ? agent.authToken : undefined,
        password: agent.authType === 'password' ? agent.authToken : undefined,
        deviceIdentity: agent.deviceId
          ? {
              deviceId: agent.deviceId,
              publicKeyPem: agent.devicePublicKey!,
              privateKeyPem: agent.devicePrivateKey!,
            }
          : undefined,
        deviceToken: agent.deviceToken,
        onDeviceTokenIssued: (token) => {
          db.updateRemoteAgent(id, { device_token: token });
        },
        onHelloOk: () => {
          clearTimeout(timeout);
          conn.stop();
          console.log('[RemoteAgent] handshake ok, device paired');
          db.updateRemoteAgent(id, { status: 'connected', last_connected_at: Date.now() });
          resolve({ status: 'ok' });
        },
        onConnectError: (err) => {
          clearTimeout(timeout);
          conn.stop();
          const details = (err as Error & { details?: { recommendedNextStep?: string } }).details;
          console.log('[RemoteAgent] handshake error:', err.message, 'details:', JSON.stringify(details));
          const isPairingRequired =
            details?.recommendedNextStep === 'wait_then_retry' || /pairing.required/i.test(err.message);
          if (isPairingRequired) {
            console.log('[RemoteAgent] handshake pending approval, will poll');
            db.updateRemoteAgent(id, { status: 'pending' });
            resolve({ status: 'pending_approval' });
          } else {
            console.log('[RemoteAgent] handshake failed:', err.message);
            db.updateRemoteAgent(id, { status: 'error' });
            resolve({ status: 'error', error: err.message });
          }
        },
        onClose: (code, reason) => {
          clearTimeout(timeout);
          // Only resolve if not already resolved by onHelloOk/onConnectError
          resolve({ status: 'error', error: `Connection closed (${code}): ${reason}` });
        },
      });

      conn.start();
    });
  });
}
