/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Express, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { spawn } from 'node:child_process';
import fs from 'fs';
import fsPromises from 'fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { getDatabase } from '@process/services/database';
import { getSystemDir } from '@process/utils/initStorage';
import { ProcessConfig } from '@process/utils/initStorage';
import { TokenMiddleware } from '@process/webserver/auth/middleware/TokenMiddleware';
import { ExtensionRegistry } from '@process/extensions';
import { SpeechToTextService } from '@process/bridge/services/SpeechToTextService';
import { isActivePreviewPort } from '@process/bridge/pptPreviewBridge';
import { isActiveOfficeWatchPort } from '@process/bridge/officeWatchBridge';
import { AIONUI_TIMESTAMP_SEPARATOR } from '@/common/config/constants';
import { INTEGRATION_KEY_ALLOWLIST } from '@/common/config/integrationKeys';
import directoryApi from '../directoryApi';
import { apiRateLimiter, authenticatedActionLimiter } from '../middleware/security';
import { registerWeixinLoginRoutes } from './weixinLoginRoutes';
import { registerWecomChannelRoutes } from './wecomChannelRoutes';

/** Temp directory used by multer disk storage — validated at runtime to prevent path traversal */
const MULTER_TEMP_DIR = os.tmpdir();

/** File upload: disk storage so large files are streamed rather than buffered in memory */
const uploadDisk = multer({ storage: multer.diskStorage({ destination: MULTER_TEMP_DIR }) });

/** STT upload: memory storage so the audio buffer is available directly for transcription */
const MAX_AUDIO_SIZE = 30 * 1024 * 1024;
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_SIZE },
});

const isLoopbackRequest = (req: Request): boolean => {
  const address = req.socket.remoteAddress ?? req.ip ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
};

type NovaMasterProbe = {
  id: string;
  name: string;
  role: string;
  port?: number;
  actionPort?: number;
  portFile?: string;
  healthPath?: string;
  detailPath?: string;
  openUrl: string;
  kind?: 'http' | 'tcp' | 'local';
  toolPath?: string;
  rootPath?: string;
  logPath?: string;
  launchPath?: string;
  expectedService?: string | string[];
  forbiddenService?: string | string[];
  primaryAction?: NovaMasterServiceAction;
};

type NovaMasterProbeResult = Omit<NovaMasterProbe, 'primaryAction'> & {
  status: 'online' | 'degraded' | 'offline';
  latencyMs: number | null;
  httpStatus: number | null;
  detail?: Record<string, unknown>;
  error?: string;
  actions?: Array<Pick<NovaMasterServiceAction, 'id' | 'label' | 'method' | 'path'>>;
};

type NovaMasterAgentStatus = 'idle' | 'working' | 'error' | 'offline';

type NovaMasterAgent = {
  id: string;
  name: string;
  status: NovaMasterAgentStatus;
  role?: string;
  description?: string;
  queue?: number;
  model?: string;
  task?: string;
  lane?: string;
  source?: string;
  health?: string;
  cost_today?: number;
  revenue_impact?: number;
};

type NovaMasterAgentRole = {
  role: string;
  ui_agent: string;
  description?: string;
};

type NovaMasterAgentCatalog = {
  roles: NovaMasterAgentRole[];
  teams: string[];
};

type NovaMasterAgentLaneStatus = 'ready' | 'working' | 'degraded' | 'parked' | 'offline';

type NovaMasterAgentLane = {
  id: string;
  name: string;
  description: string;
  status: NovaMasterAgentLaneStatus;
  agents: NovaMasterAgent[];
  queue: number;
  model?: string;
  services: string[];
};

type NovaMasterModelInfo = {
  id: string;
  label: string;
  provider: string;
  selected: boolean;
  available: boolean;
  source: 'nova-claude-model' | 'fallback';
  tags: string[];
};

type NovaMasterModelRouter = {
  current: string;
  claudeLaunchModel?: string;
  cliAvailable: boolean;
  ollamaCloudAvailable: boolean;
  models: NovaMasterModelInfo[];
  updatedAt: string;
};

type NovaMasterControlPlane = {
  mode: 'live' | 'pc-light' | 'degraded';
  summary: string;
  parked: string[];
  risks: string[];
};

type NovaMasterTelemetry = {
  cpu: number;
  memory: number;
  disk: number;
  uptime: number;
  revenue: number;
  cost: number;
  agentsTotal: number;
  agentsWorking: number;
  servicesOnline: number;
  servicesTotal: number;
};

type NovaMasterServiceAction = {
  id: string;
  label: string;
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
};

// Machine-specific control-plane doc path — never hardcode a real Windows
// username/OneDrive path in this public repo (see AGENTS.md privacy notes).
// Operators set this locally via env; the entry is simply absent otherwise.
const NOVACORE_CONTROL_ROOT_PATH = process.env.NOVACORE_CONTROL_ROOT_PATH ?? '';
const NOVACORE_CONTROL_DOC_URL = NOVACORE_CONTROL_ROOT_PATH
  ? `file://${NOVACORE_CONTROL_ROOT_PATH}/NovaCore%20Control%20Plane.md`
  : '';

const JARVIS_AGENTS_PORT = 8765;
const NOVA_CLAUDE_MODEL_CLI = '/home/faramix/bin/nova-claude-model';
const NOVA_MODEL_FALLBACKS = [
  'ollama/minimax-m3:cloud',
  'ollama/kimi-k2.6:cloud',
  'ollama/kimi-k2.5:cloud',
  'ollama/qwen3-coder-next:cloud',
  'ollama/glm-5.1:cloud',
  'ollama/deepseek-v4-pro:cloud',
  'openai/gpt-5.5',
  'openai/gpt-5.5-pro',
  'xai/grok-4.20',
];

const NOVAMASTER_PROBES: NovaMasterProbe[] = [
  {
    id: 'aionui',
    name: 'AionUi',
    role: 'Companion cockpit for Agent OS',
    port: 3000,
    healthPath: '/api/auth/status',
    openUrl: 'http://127.0.0.1:3000/#/guid',
    launchPath: '/home/faramix/bin/novamaster-open-aionui-native',
  },
  {
    id: 'agent-os-growth',
    name: 'Agent OS Desktop',
    role: 'Primary control plane and source of truth',
    port: 3737,
    healthPath: '/api/health',
    openUrl: 'http://127.0.0.1:3737/seo-office',
  },
  {
    id: 'open-notebook',
    name: 'Open Notebook',
    role: 'Self-hosted NotebookLM engine (Agent OS notebooklm-factory backend)',
    port: 5055,
    healthPath: '/health',
    openUrl: 'http://127.0.0.1:8502',
  },
  {
    id: 'novacore-control',
    name: 'NovaCore Control',
    role: 'Control-plane source',
    kind: 'local',
    rootPath: NOVACORE_CONTROL_ROOT_PATH,
    openUrl: NOVACORE_CONTROL_DOC_URL,
    launchPath: '/home/faramix/bin/novamaster-open-novacore-control-native',
  },
  {
    id: 'jarvis',
    name: 'Jarvis',
    role: 'Command cockpit API',
    port: 8096,
    healthPath: '/health',
    openUrl: 'http://127.0.0.1:8096/health',
    launchPath: '/home/faramix/bin/novamaster-open-jarvis-native',
    primaryAction: {
      id: 'chat',
      label: 'Chat',
      method: 'POST',
      path: '/chat',
      body: { message: 'status' },
    },
  },
  {
    id: 'space-agent',
    name: 'Space Agent',
    role: 'Workspace agent',
    port: 3003,
    healthPath: '/api/health',
    openUrl: 'http://127.0.0.1:3003',
    primaryAction: {
      id: 'health',
      label: 'Health',
      method: 'GET',
      path: '/api/health',
    },
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    role: 'Gateway and Mission Control',
    port: 18793,
    actionPort: 18793,
    kind: 'tcp',
    openUrl: 'ws://127.0.0.1:18793',
    healthPath: '/health',
    primaryAction: {
      id: 'health',
      label: 'Health',
      method: 'GET',
      path: '/health',
    },
  },
  {
    id: 'goclaw',
    name: 'GoClaw',
    role: 'Protocol gateway',
    port: 18790,
    healthPath: '/health',
    openUrl: 'http://127.0.0.1:18790/health',
    primaryAction: {
      id: 'health',
      label: 'Health',
      method: 'GET',
      path: '/health',
    },
  },
  {
    id: 'metaclaw',
    name: 'MetaClaw',
    role: 'Model router',
    port: 30000,
    healthPath: '/health',
    openUrl: 'http://127.0.0.1:30000/v1/models',
  },
  {
    id: 'clawmem',
    name: 'ClawMem',
    role: 'Memory index',
    port: 7438,
    healthPath: '/health',
    openUrl: 'http://127.0.0.1:7438/health',
  },
  {
    id: 'video-factory',
    name: 'Video Factory',
    role: 'Analysis and render queue',
    kind: 'local',
    toolPath: '/home/faramix/bin/novamaster-video-factory',
    rootPath: '/home/faramix/NovaMaster/video-factory',
    logPath: '/home/faramix/NovaMaster/video-factory/logs',
    openUrl: 'file:///home/faramix/NovaMaster/video-factory',
  },
  {
    id: 'music-clips',
    name: 'Music Clip Factory',
    role: 'Beat-matched clip studio',
    kind: 'local',
    toolPath: '/home/faramix/bin/novamaster-music-clips-studio',
    rootPath: '/home/faramix/NovaMaster/video-factory/music-clips',
    logPath: '/home/faramix/NovaMaster/video-factory/music-clips/logs',
    openUrl: 'file:///home/faramix/NovaMaster/video-factory/music-clips/output',
  },
  {
    id: 'hermes',
    name: 'Hermes',
    role: 'Self-improving agent',
    port: 8644,
    healthPath: '/health',
    openUrl: 'http://127.0.0.1:8644/health',
    primaryAction: {
      id: 'health',
      label: 'Health',
      method: 'GET',
      path: '/health',
    },
  },
  {
    id: 'hermes-dashboard',
    name: 'Hermes Dashboard',
    role: 'Swarm and skills UI',
    port: 9119,
    healthPath: '/',
    openUrl: 'http://127.0.0.1:9119',
  },
  {
    id: 'vibevoice',
    name: 'VibeVoice',
    role: 'Voice layer',
    port: 8094,
    healthPath: '/health',
    openUrl: 'http://127.0.0.1:8094/health',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    role: 'Local/cloud models',
    port: 11434,
    healthPath: '/api/tags',
    openUrl: 'http://127.0.0.1:11434/api/tags',
  },
  {
    id: 'litellm',
    name: 'LiteLLM',
    role: 'Inference gateway',
    port: 4000,
    healthPath: '/health/readiness',
    openUrl: 'http://127.0.0.1:4000/health/readiness',
  },
];

function summarizeNovaPayload(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  const source = payload as Record<string, unknown>;
  const detail: Record<string, unknown> = {};
  const scalarKeys = [
    'status',
    'ok',
    'success',
    'healthy',
    'service',
    'name',
    'version',
    'needsSetup',
    'isAuthenticated',
    'documents',
    'needsEmbedding',
    'hasVectors',
    'protocol',
  ];

  for (const key of scalarKeys) {
    const value = source[key];
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      detail[key] = value;
    }
  }

  const models = source.models;
  if (Array.isArray(models)) {
    detail.models = models.length;
  }

  const data = source.data;
  if (Array.isArray(data)) {
    detail.models = data.length;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    if (Array.isArray(nested.models)) {
      detail.models = nested.models.length;
    }
    if (typeof nested.status === 'string') {
      detail.status = nested.status;
    }
  }

  for (const key of ['response', 'reply', 'message']) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      detail.responseChars = value.length;
      break;
    }
  }

  return Object.keys(detail).length > 0 ? detail : undefined;
}

function normalizeServiceMatchers(input: string | string[] | undefined): string[] {
  const values = Array.isArray(input) ? input : input ? [input] : [];
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function getNovaPayloadServiceName(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  const source = payload as Record<string, unknown>;
  for (const key of ['service', 'name']) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function validateNovaPayloadService(probe: NovaMasterProbe, payload: unknown): string | undefined {
  const serviceName = getNovaPayloadServiceName(payload);
  if (!serviceName) {
    return undefined;
  }

  const normalized = serviceName.toLowerCase();
  const forbidden = normalizeServiceMatchers(probe.forbiddenService);
  if (forbidden.some((matcher) => normalized.includes(matcher))) {
    return `unexpected service: ${serviceName}`;
  }

  const expected = normalizeServiceMatchers(probe.expectedService);
  if (expected.length > 0 && !expected.some((matcher) => normalized.includes(matcher))) {
    return `expected ${expected.join(' or ')}, got ${serviceName}`;
  }

  return undefined;
}

async function requestNovaMasterEndpoint(
  port: number,
  requestPath: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; timeoutMs?: number } = {}
): Promise<{ httpStatus: number | null; latencyMs: number; payload: unknown }> {
  const method = options.method ?? 'GET';
  const startedAt = Date.now();
  const body = options.body ? JSON.stringify(options.body) : undefined;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: requestPath,
        method,
        headers: {
          Accept: 'application/json',
          ...(body
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (responseBody.length < 32768) {
            responseBody += chunk;
          }
        });
        res.on('end', () => {
          let payload: unknown = undefined;
          if (responseBody.trim()) {
            try {
              payload = JSON.parse(responseBody);
            } catch {
              payload = { body: responseBody.slice(0, 500) };
            }
          }

          resolve({
            httpStatus: res.statusCode ?? null,
            latencyMs: Date.now() - startedAt,
            payload,
          });
        });
      }
    );

    req.setTimeout(options.timeoutMs ?? 2500, () => {
      req.destroy(new Error('request timeout'));
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function getNovaMasterActions(probe: NovaMasterProbe): Array<Pick<NovaMasterServiceAction, 'id' | 'label' | 'method' | 'path'>> | undefined {
  if (!probe.primaryAction) {
    return undefined;
  }

  const { id, label, method, path: actionPath } = probe.primaryAction;
  return [{ id, label, method, path: actionPath }];
}

function getPublicNovaMasterProbe(probe: NovaMasterProbe): Omit<NovaMasterProbe, 'primaryAction'> {
  const { primaryAction: _primaryAction, ...publicProbe } = probe;
  return publicProbe;
}

async function resolveNovaMasterPort(probe: NovaMasterProbe): Promise<number | undefined> {
  if (!probe.portFile) {
    return probe.port;
  }

  try {
    const raw = await fsPromises.readFile(probe.portFile, 'utf8');
    const match = raw.match(/\d{2,5}/);
    if (match) {
      const port = Number(match[0]);
      if (Number.isInteger(port) && port > 0 && port <= 65535) {
        return port;
      }
    }
  } catch {
    // Fall back to the configured port when the runtime port file is missing.
  }

  return probe.port;
}

function resolveNovaMasterOpenUrl(probe: NovaMasterProbe, port?: number): string {
  if (!port) {
    return probe.openUrl;
  }

  return probe.openUrl.replaceAll('{port}', String(port));
}

async function probeNovaMasterService(probe: NovaMasterProbe): Promise<NovaMasterProbeResult> {
  if (probe.kind === 'local') {
    return probeNovaMasterLocalTool(probe);
  }
  if (probe.kind === 'tcp') {
    return probeNovaMasterTcpPort(probe);
  }

  const port = await resolveNovaMasterPort(probe);
  const openUrl = resolveNovaMasterOpenUrl(probe, port);

  if (!port || !probe.healthPath) {
    return {
      ...getPublicNovaMasterProbe(probe),
      port,
      openUrl,
      status: 'offline',
      latencyMs: null,
      httpStatus: null,
      error: 'missing http probe target',
      actions: getNovaMasterActions(probe),
    };
  }

  const startedAt = Date.now();

  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path: probe.healthPath,
        headers: { Accept: 'application/json' },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (body.length < 32768) {
            body += chunk;
          }
        });
        res.on('end', async () => {
          const latencyMs = Date.now() - startedAt;
          const httpStatus = res.statusCode ?? null;
          let payload: unknown;

          try {
            payload = body ? JSON.parse(body) : undefined;
          } catch {
            payload = undefined;
          }

          const serviceError = validateNovaPayloadService(probe, payload);
          const detail = summarizeNovaPayload(payload) ?? {};

          if (probe.detailPath && httpStatus && httpStatus >= 200 && httpStatus < 300) {
            try {
              const detailResponse = await requestNovaMasterEndpoint(port, probe.detailPath, { timeoutMs: 1800 });
              Object.assign(detail, summarizeNovaPayload(detailResponse.payload));
            } catch (error) {
              detail.detailError = error instanceof Error ? error.message : 'detail probe failed';
            }
          }

          resolve({
            ...getPublicNovaMasterProbe(probe),
            port,
            openUrl,
            status:
              serviceError || !httpStatus || httpStatus < 200 || httpStatus >= 300 ? 'degraded' : 'online',
            latencyMs,
            httpStatus,
            detail: Object.keys(detail).length > 0 ? detail : undefined,
            error: serviceError,
            actions: getNovaMasterActions(probe),
          });
        });
      }
    );

    req.setTimeout(1400, () => {
      req.destroy(new Error('timeout'));
    });

    req.on('error', (error: NodeJS.ErrnoException) => {
      resolve({
        ...getPublicNovaMasterProbe(probe),
        port,
        openUrl,
        status: 'offline',
        latencyMs: null,
        httpStatus: null,
        error: error.code === 'ECONNREFUSED' ? 'connection refused' : error.message,
        actions: getNovaMasterActions(probe),
      });
    });
  });
}

function withNovaDeadline<T>(promise: Promise<T>, timeoutMs: number, fallback: () => T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(fallback());
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(fallback());
      });
  });
}

function buildNovaMasterProbeDeadlineResult(probe: NovaMasterProbe): NovaMasterProbeResult {
  return {
    ...getPublicNovaMasterProbe(probe),
    port: probe.port,
    openUrl: probe.openUrl,
    status: 'offline',
    latencyMs: null,
    httpStatus: null,
    error: 'probe deadline',
    actions: getNovaMasterActions(probe),
  };
}

async function probeNovaMasterTcpPort(probe: NovaMasterProbe): Promise<NovaMasterProbeResult> {
  const port = await resolveNovaMasterPort(probe);
  const openUrl = resolveNovaMasterOpenUrl(probe, port);
  const startedAt = Date.now();

  if (!port) {
    return {
      ...getPublicNovaMasterProbe(probe),
      port,
      openUrl,
      status: 'offline',
      latencyMs: null,
      httpStatus: null,
      error: 'missing tcp probe target',
      actions: getNovaMasterActions(probe),
    };
  }

  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (result: NovaMasterProbeResult) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1400);
    socket.once('connect', () => {
      finish({
        ...getPublicNovaMasterProbe(probe),
        port,
        openUrl,
        status: 'online',
        latencyMs: Date.now() - startedAt,
        httpStatus: null,
        detail: { protocol: 'tcp' },
        actions: getNovaMasterActions(probe),
      });
    });
    socket.once('timeout', () => {
      finish({
        ...getPublicNovaMasterProbe(probe),
        port,
        openUrl,
        status: 'offline',
        latencyMs: null,
        httpStatus: null,
        error: 'tcp timeout',
        actions: getNovaMasterActions(probe),
      });
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      finish({
        ...getPublicNovaMasterProbe(probe),
        port,
        openUrl,
        status: 'offline',
        latencyMs: null,
        httpStatus: null,
        error: error.code === 'ECONNREFUSED' ? 'connection refused' : error.message,
        actions: getNovaMasterActions(probe),
      });
    });
  });
}

async function countEntries(targetPath: string | undefined, maxDepth = 1): Promise<number> {
  if (!targetPath) return 0;
  try {
    const entries = await fsPromises.readdir(targetPath, { withFileTypes: true });
    if (maxDepth <= 1) return entries.length;
    return entries.length;
  } catch {
    return 0;
  }
}

async function probeNovaMasterLocalTool(probe: NovaMasterProbe): Promise<NovaMasterProbeResult> {
  const startedAt = Date.now();
  const detail: Record<string, unknown> = {};

  try {
    if (probe.toolPath) {
      await fsPromises.access(probe.toolPath, fs.constants.X_OK);
      detail.tool = path.basename(probe.toolPath);
    }

    if (probe.rootPath) {
      await fsPromises.mkdir(probe.rootPath, { recursive: true });
      detail.root = probe.rootPath;
      detail.jobs = await countEntries(path.join(probe.rootPath, 'output'));
      detail.queue = await countEntries(path.join(probe.rootPath, 'queue'));
    }

    if (probe.logPath) {
      detail.logs = await countEntries(probe.logPath);
    }

    return {
      ...getPublicNovaMasterProbe(probe),
      status: 'online',
      latencyMs: Date.now() - startedAt,
      httpStatus: null,
      detail,
      actions: getNovaMasterActions(probe),
    };
  } catch (error) {
    return {
      ...getPublicNovaMasterProbe(probe),
      status: 'offline',
      latencyMs: null,
      httpStatus: null,
      detail,
      error: error instanceof Error ? error.message : 'local probe failed',
      actions: getNovaMasterActions(probe),
    };
  }
}

function extractNovaMasterAgentItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const source = toRecord(payload);
  if (!source) {
    return [];
  }

  if (Array.isArray(source.agents)) {
    return source.agents;
  }

  const data = toRecord(source.data);
  if (data && Array.isArray(data.agents)) {
    return data.agents;
  }

  return [];
}

function extractNovaMasterAgentRoles(payload: unknown): NovaMasterAgentCatalog {
  const source = toRecord(payload);
  if (!source) {
    return { roles: [], teams: [] };
  }

  const roles = Array.isArray(source.roles)
    ? source.roles
        .map((role) => {
          const item = toRecord(role);
          const roleName = typeof item?.role === 'string' ? item.role.trim() : '';
          const uiAgent = typeof item?.ui_agent === 'string' ? item.ui_agent.trim() : '';
          if (!roleName || !uiAgent) {
            return undefined;
          }

          const description = typeof item?.description === 'string' ? item.description.trim() : '';
          return {
            role: roleName,
            ui_agent: uiAgent,
            ...(description ? { description } : {}),
          };
        })
        .filter((role): role is NovaMasterAgentRole => Boolean(role))
    : [];

  const teams = Array.isArray(source.teams)
    ? source.teams
        .map((team) => (typeof team === 'string' ? team.trim() : ''))
        .filter(Boolean)
    : [];

  return { roles, teams };
}

function normalizeNovaMasterAgentStatus(status: unknown): NovaMasterAgentStatus {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';

  if (['working', 'running', 'busy', 'active', 'processing', 'queued'].includes(normalized)) {
    return 'working';
  }
  if (['error', 'failed', 'fail', 'crashed', 'blocked'].includes(normalized)) {
    return 'error';
  }
  if (['offline', 'disabled', 'unavailable', 'stopped'].includes(normalized)) {
    return 'offline';
  }

  return 'idle';
}

async function readNovaMasterAgentCatalog(): Promise<NovaMasterAgentCatalog> {
  try {
    const response = await requestNovaMasterEndpoint(JARVIS_AGENTS_PORT, '/agents/roles', { timeoutMs: 1500 });
    if (!response.httpStatus || response.httpStatus < 200 || response.httpStatus >= 300) {
      return { roles: [], teams: [] };
    }

    return extractNovaMasterAgentRoles(response.payload);
  } catch {
    return { roles: [], teams: [] };
  }
}

function titleCaseAgentName(id: string): string {
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeNovaMasterAgent(
  agent: unknown,
  rolesByAgentId: Map<string, NovaMasterAgentRole>
): NovaMasterAgent | undefined {
  const source = toRecord(agent);
  if (!source) {
    return undefined;
  }

  const rawId = typeof source.id === 'string' ? source.id.trim() : '';
  const rawName = typeof source.name === 'string' ? source.name.trim() : '';
  const id = rawId || rawName.toLowerCase().replace(/\s+/g, '-');
  if (!id) {
    return undefined;
  }

  const queue = typeof source.queue === 'number' && Number.isFinite(source.queue) ? source.queue : 0;
  const role = rolesByAgentId.get(id);
  const normalized: NovaMasterAgent = {
    id,
    name: rawName || titleCaseAgentName(id),
    status: normalizeNovaMasterAgentStatus(source.status),
    ...(role?.role ? { role: role.role } : {}),
    ...(role?.description ? { description: role.description } : {}),
    ...(queue > 0 ? { queue } : {}),
  };

  if (typeof source.model === 'string' && source.model.trim()) {
    normalized.model = source.model.trim();
  }
  if (typeof source.task === 'string' && source.task.trim()) {
    normalized.task = source.task.trim();
  } else if (queue > 0) {
    normalized.task = `${queue} queued`;
  }

  return normalized;
}

async function readNovaMasterAgents(catalog: NovaMasterAgentCatalog): Promise<NovaMasterAgent[]> {
  try {
    const response = await requestNovaMasterEndpoint(JARVIS_AGENTS_PORT, '/agents', { timeoutMs: 1500 });
    if (!response.httpStatus || response.httpStatus < 200 || response.httpStatus >= 300) {
      return [];
    }

    const rolesByAgentId = new Map(catalog.roles.map((role) => [role.ui_agent, role]));
    return extractNovaMasterAgentItems(response.payload)
      .map((agent) => normalizeNovaMasterAgent(agent, rolesByAgentId))
      .filter((agent): agent is NovaMasterAgent => Boolean(agent));
  } catch {
    return [];
  }
}

function runNovaLocalCommand(
  command: string,
  args: string[],
  timeoutMs = 2500
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const child = spawn(command, args, {
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (exitCode: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = `${stdout}${chunk.toString('utf8')}`.slice(-30000);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-12000);
    });
    child.once('error', (error) => {
      stderr = error instanceof Error ? error.message : String(error);
      finish(null);
    });
    child.once('close', (code) => finish(code));
  });
}

function parseNovaKeyValueOutput(stdout: string): Record<string, string> {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes('='))
    .reduce<Record<string, string>>((acc, line) => {
      const index = line.indexOf('=');
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (key) {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function normalizeNovaModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.includes('/') || !trimmed.includes(':cloud')) {
    return trimmed;
  }
  return `ollama/${trimmed}`;
}

function getNovaModelProvider(modelId: string): string {
  if (modelId.startsWith('ollama/')) return modelId.includes(':cloud') ? 'Ollama Cloud' : 'Ollama';
  if (modelId.startsWith('openai/')) return 'OpenAI';
  if (modelId.startsWith('deepseek/')) return 'DeepSeek';
  if (modelId.startsWith('xai/')) return 'xAI';
  if (modelId.startsWith('groq/')) return 'Groq';
  if (modelId.startsWith('lmstudio/')) return 'LM Studio';
  return 'Custom';
}

function getNovaModelLabel(modelId: string): string {
  const shortId = modelId.replace(/^ollama\//, '').replace(/:cloud$/, '').replace(/^[^/]+\//, '');
  return shortId
    .split(/[-_:]+/)
    .filter(Boolean)
    .map((part) => {
      const upper = part.toUpperCase();
      if (['gpt', 'glm', 'm3', 'k2', 'qwen3'].includes(part.toLowerCase())) {
        return upper;
      }
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(' ');
}

function toNovaModelInfo(
  modelId: string,
  currentModel: string,
  source: NovaMasterModelInfo['source']
): NovaMasterModelInfo {
  const provider = getNovaModelProvider(modelId);
  const tags = [
    modelId.includes(':cloud') ? 'cloud' : 'local',
    modelId.includes('coder') || modelId.includes('deepseek') || modelId.includes('minimax') ? 'coding' : 'general',
  ];
  return {
    id: modelId,
    label: getNovaModelLabel(modelId),
    provider,
    selected: modelId === currentModel,
    available: source === 'nova-claude-model',
    source,
    tags,
  };
}

function parseNovaModelList(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const numbered = line.match(/^\d+\)\s+(.+?)\s{2,}(\S+)$/);
      if (numbered?.[2]) {
        return normalizeNovaModelId(numbered[2]);
      }
      const modelLike = line.match(/((?:ollama|openai|deepseek|xai|groq|lmstudio)\/[A-Za-z0-9._:-]+|[A-Za-z0-9._-]+:cloud)$/);
      return modelLike?.[1] ? normalizeNovaModelId(modelLike[1]) : '';
    })
    .filter(Boolean);
}

async function readNovaMasterModelRouter(): Promise<NovaMasterModelRouter> {
  const currentResult = await runNovaLocalCommand(NOVA_CLAUDE_MODEL_CLI, ['current'], 1800);
  const currentKv = parseNovaKeyValueOutput(currentResult.stdout);
  const currentModel = normalizeNovaModelId(currentKv.selected_model || currentKv.model || 'ollama/minimax-m3:cloud');
  const claudeLaunchModel = currentKv.claude_launch_model || currentModel.replace(/^ollama\//, '');

  const listResult = await runNovaLocalCommand(NOVA_CLAUDE_MODEL_CLI, ['list', '--target', 'claude'], 2600);
  const liveIds = listResult.exitCode === 0 ? parseNovaModelList(listResult.stdout) : [];
  const seen = new Set<string>();
  const models = [...liveIds, currentModel, ...NOVA_MODEL_FALLBACKS]
    .map(normalizeNovaModelId)
    .filter(Boolean)
    .filter((modelId) => {
      if (seen.has(modelId)) return false;
      seen.add(modelId);
      return true;
    })
    .map((modelId) => toNovaModelInfo(modelId, currentModel, liveIds.includes(modelId) ? 'nova-claude-model' : 'fallback'));

  return {
    current: currentModel,
    ...(claudeLaunchModel ? { claudeLaunchModel } : {}),
    cliAvailable: currentResult.exitCode === 0,
    ollamaCloudAvailable: models.some((model) => model.provider === 'Ollama Cloud' && model.available),
    models,
    updatedAt: new Date().toISOString(),
  };
}

function getNovaServiceStatus(services: NovaMasterProbeResult[], serviceIds: string[]): NovaMasterProbeResult[] {
  const byId = new Map(services.map((service) => [service.id, service]));
  return serviceIds.map((id) => byId.get(id)).filter((service): service is NovaMasterProbeResult => Boolean(service));
}

function getNovaAgentStatusFromServices(services: NovaMasterProbeResult[]): NovaMasterAgentStatus {
  if (services.some((service) => service.status === 'online')) return 'idle';
  if (services.some((service) => service.status === 'degraded')) return 'error';
  return 'offline';
}

function buildNovaMasterVisibleAgents(
  catalog: NovaMasterAgentCatalog,
  agents: NovaMasterAgent[],
  services: NovaMasterProbeResult[],
  modelRouter: NovaMasterModelRouter
): NovaMasterAgent[] {
  if (agents.length > 0) {
    return agents.map((agent) => ({
      ...agent,
      model: agent.model || modelRouter.current,
      source: agent.source || 'jarvis-agents',
    }));
  }

  const blueprints: Array<Omit<NovaMasterAgent, 'status'> & { services: string[] }> = [
    { id: 'planner', name: 'Planner', role: 'planner_agent', lane: 'orchestrate', description: 'Breaks goals into executable subagent tasks.', services: ['openclaw', 'hermes', 'jarvis'] },
    { id: 'builder', name: 'Builder', role: 'builder_agent', lane: 'build', description: 'Implements code and stack changes through OpenClaw/Codex.', services: ['openclaw', 'goclaw', 'aionui'] },
    { id: 'reviewer', name: 'Reviewer', role: 'review_agent', lane: 'build', description: 'Reviews diffs, risk, and missing verification.', services: ['openclaw', 'hermes'] },
    { id: 'debugger', name: 'Debugger', role: 'debug_agent', lane: 'ops', description: 'Reads probes, logs, ports, and degraded services.', services: ['hermes', 'clawmem', 'litellm'] },
    { id: 'researcher', name: 'Researcher', role: 'research_agent', lane: 'research', description: 'Runs source-backed web and local research tasks.', services: ['space-agent', 'openclaw'] },
    { id: 'ui-agent', name: 'Aion UI Agent', role: 'ui_agent', lane: 'interface', description: 'Controls cockpit UI, native launchers, and operator flows.', services: ['aionui', 'jarvis'] },
    { id: 'api-agent', name: 'API Agent', role: 'api_agent', lane: 'interface', description: 'Tracks OpenClaw, LiteLLM, Ollama, and service APIs.', services: ['openclaw', 'litellm', 'ollama'] },
    { id: 'memory-curator', name: 'Memory Curator', role: 'memory_agent', lane: 'memory', description: 'Connects ClawMem, Graphify, receipts, and persistent context.', services: ['clawmem', 'hermes'] },
    { id: 'discord-secretary', name: 'Discord Secretary', role: 'control_bus_agent', lane: 'ops', description: 'Primary mobile command bus and live proof channel.', services: ['jarvis', 'hermes'] },
    { id: 'media-agent', name: 'Media Agent', role: 'media_agent', lane: 'media', description: 'Coordinates Video Factory, music clips, OCR, and assets.', services: ['video-factory', 'music-clips', 'vibevoice'] },
  ];

  const catalogDescriptions = new Map(catalog.roles.map((role) => [role.role, role.description]));
  return blueprints.map((blueprint) => {
    const relatedServices = getNovaServiceStatus(services, blueprint.services);
    return {
      id: blueprint.id,
      name: blueprint.name,
      status: getNovaAgentStatusFromServices(relatedServices),
      role: blueprint.role,
      lane: blueprint.lane,
      source: 'aion-control-plane',
      description: catalogDescriptions.get(blueprint.role || '') || blueprint.description,
      model: modelRouter.current,
      health: relatedServices.map((service) => `${service.name}:${service.status}`).join(', ') || 'no service probes',
    };
  });
}

function getNovaLaneStatus(agents: NovaMasterAgent[]): NovaMasterAgentLaneStatus {
  if (agents.some((agent) => agent.status === 'working')) return 'working';
  if (agents.some((agent) => agent.status === 'idle')) return 'ready';
  if (agents.some((agent) => agent.status === 'error')) return 'degraded';
  return 'parked';
}

function buildNovaMasterAgentLanes(
  agents: NovaMasterAgent[],
  services: NovaMasterProbeResult[],
  modelRouter: NovaMasterModelRouter
): NovaMasterAgentLane[] {
  const laneSpecs = [
    { id: 'orchestrate', name: 'Orchestrator', description: 'Planner and task routing across subagents.', services: ['openclaw', 'jarvis', 'hermes'] },
    { id: 'build', name: 'Build Swarm', description: 'Codex/OpenClaw builder and reviewer lanes.', services: ['openclaw', 'goclaw', 'aionui'] },
    { id: 'ops', name: 'Ops Guard', description: 'Ports, health, VPS split, Discord control bus.', services: ['hermes', 'jarvis', 'litellm'] },
    { id: 'research', name: 'Research Mesh', description: 'Browser, web search, source-backed exploration.', services: ['space-agent', 'openclaw'] },
    { id: 'interface', name: 'UI/API Bridge', description: 'Aion cockpit controls and safe API actions.', services: ['aionui', 'openclaw', 'ollama'] },
    { id: 'memory', name: 'Memory Core', description: 'ClawMem, Graphify, receipts, and long-running context.', services: ['clawmem', 'hermes'] },
    { id: 'media', name: 'Media Factory', description: 'Video Factory, music clips, voice, and OCR tooling.', services: ['video-factory', 'music-clips', 'vibevoice'] },
  ];

  return laneSpecs.map((lane) => {
    const laneAgents = agents.filter((agent) => agent.lane === lane.id);
    const relatedServices = getNovaServiceStatus(services, lane.services);
    const serviceQueue = relatedServices.reduce((total, service) => {
      const queue = typeof service.detail?.queue === 'number' ? service.detail.queue : 0;
      return total + queue;
    }, 0);
    return {
      id: lane.id,
      name: lane.name,
      description: lane.description,
      services: lane.services,
      status: getNovaLaneStatus(laneAgents),
      agents: laneAgents,
      queue: laneAgents.reduce((total, agent) => total + (agent.queue || 0), serviceQueue),
      model: modelRouter.current,
    };
  });
}

function buildNovaMasterControlPlane(
  services: NovaMasterProbeResult[],
  lanes: NovaMasterAgentLane[],
  modelRouter: NovaMasterModelRouter
): NovaMasterControlPlane {
  const coreOffline = services
    .filter((service) => ['jarvis', 'hermes', 'claw3d', 'clawmem', 'space-agent', 'litellm'].includes(service.id))
    .filter((service) => service.status === 'offline')
    .map((service) => `${service.name} :${service.port || 'n/a'}`);
  const degradedServices = services.filter((service) => service.status === 'degraded').map((service) => service.name);
  const readyLanes = lanes.filter((lane) => lane.status === 'ready' || lane.status === 'working').length;

  return {
    mode: coreOffline.length > 0 ? 'pc-light' : degradedServices.length > 0 ? 'degraded' : 'live',
    summary: `${readyLanes}/${lanes.length} lanes ready · ${modelRouter.current}`,
    parked: coreOffline.slice(0, 8),
    risks: [
      ...degradedServices.map((service) => `${service} degraded`),
      ...(modelRouter.cliAvailable ? [] : ['nova-claude-model CLI unavailable']),
      ...(modelRouter.ollamaCloudAvailable ? [] : ['Ollama cloud list unavailable']),
    ].slice(0, 8),
  };
}

async function selectNovaMasterModel(modelId: string): Promise<Record<string, unknown>> {
  const requestedModel = normalizeNovaModelId(modelId);
  if (!requestedModel) {
    throw new Error('Missing model id');
  }

  const router = await readNovaMasterModelRouter();
  const allowedModels = new Set(router.models.map((model) => model.id));
  if (!allowedModels.has(requestedModel)) {
    throw new Error(`Unsupported NovaMaster model: ${requestedModel}`);
  }

  const result = await runNovaLocalCommand(NOVA_CLAUDE_MODEL_CLI, ['set', requestedModel], 6000);
  if (result.exitCode !== 0) {
    const msg = result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode ?? 'unknown'}`;
    throw new Error(`Model select failed: ${msg.slice(0, 300)}`);
  }

  const modelRouter = await readNovaMasterModelRouter();
  return {
    requestedModel,
    selectedModel: modelRouter.current,
    modelRouter,
  };
}

function buildNovaMasterTelemetry(
  services: NovaMasterProbeResult[],
  agents: NovaMasterAgent[]
): NovaMasterTelemetry {
  const servicesOnline = services.filter((service) => service.status === 'online').length;
  const totalMemory = os.totalmem();
  const usedMemory = Math.max(totalMemory - os.freemem(), 0);
  const cpuLoad = os.loadavg()[0] ?? 0;
  const cpuCount = Math.max(os.cpus().length, 1);

  return {
    cpu: Math.round(Math.min((cpuLoad / cpuCount) * 100, 100)),
    memory: totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0,
    disk: 0,
    uptime: Math.round(os.uptime() / 3600),
    revenue: 0,
    cost: 0,
    agentsTotal: agents.length,
    agentsWorking: agents.filter((agent) => agent.status === 'working').length,
    servicesOnline,
    servicesTotal: services.length,
  };
}

async function getNovaMasterStackStatus() {
  const services = await Promise.all(
    NOVAMASTER_PROBES.map((probe) =>
      withNovaDeadline(probeNovaMasterService(probe), 2600, () => buildNovaMasterProbeDeadlineResult(probe))
    )
  );
  const agentCatalog = await withNovaDeadline(readNovaMasterAgentCatalog(), 1800, () => ({ roles: [], teams: [] }));
  const modelRouter = await withNovaDeadline(readNovaMasterModelRouter(), 3600, () => ({
    current: 'ollama/minimax-m3:cloud',
    claudeLaunchModel: 'minimax-m3:cloud',
    cliAvailable: false,
    ollamaCloudAvailable: false,
    models: NOVA_MODEL_FALLBACKS.map((modelId) => toNovaModelInfo(modelId, 'ollama/minimax-m3:cloud', 'fallback')),
    updatedAt: new Date().toISOString(),
  }));
  const rawAgents = await withNovaDeadline(readNovaMasterAgents(agentCatalog), 1800, () => []);
  const agents = buildNovaMasterVisibleAgents(agentCatalog, rawAgents, services, modelRouter);
  const agentLanes = buildNovaMasterAgentLanes(agents, services, modelRouter);
  const online = services.filter((service) => service.status === 'online').length;
  const degraded = services.filter((service) => service.status === 'degraded').length;

  return {
    updatedAt: new Date().toISOString(),
    summary: {
      total: services.length,
      online,
      degraded,
      offline: services.length - online - degraded,
    },
    services,
    agents,
    agentLanes,
    agentTeams: agentCatalog.teams,
    modelRouter,
    controlPlane: buildNovaMasterControlPlane(services, agentLanes, modelRouter),
    telemetry: buildNovaMasterTelemetry(services, agents),
    autopilot: 'manual',
  };
}

function buildNovaMasterActionReceipt(
  action: NovaMasterServiceAction,
  detail: Record<string, unknown> | undefined,
  httpStatus: number | null
): string {
  if (!httpStatus || httpStatus < 200 || httpStatus >= 300) {
    return `${action.label} returned HTTP ${httpStatus ?? 'unknown'}`;
  }

  if (typeof detail?.models === 'number') {
    return `${action.label}: ${detail.models} models`;
  }

  if (typeof detail?.protocol === 'number') {
    return `${action.label}: protocol ${detail.protocol}`;
  }

  if (typeof detail?.responseChars === 'number') {
    return `${action.label}: response received`;
  }

  const status = detail?.status ?? detail?.ok ?? detail?.healthy ?? detail?.success;
  if (typeof status === 'string' || typeof status === 'boolean' || typeof status === 'number') {
    return `${action.label}: ${String(status)}`;
  }

  return `${action.label}: ok`;
}

async function runNovaMasterServiceAction(serviceId: string): Promise<Record<string, unknown>> {
  const probe = NOVAMASTER_PROBES.find((candidate) => candidate.id === serviceId);
  if (!probe) {
    throw new Error(`Unknown NovaMaster service: ${serviceId}`);
  }

  const port = await resolveNovaMasterPort(probe);
  if (!port) {
    throw new Error(`Missing NovaMaster port for ${probe.name}`);
  }

  const action =
    probe.primaryAction ??
    (probe.healthPath
      ? {
          id: 'health',
          label: 'Health',
          method: 'GET' as const,
          path: probe.healthPath,
        }
      : undefined);

  if (!action) {
    throw new Error(`No NovaMaster action configured for ${probe.name}`);
  }

  const actionPort = probe.actionPort ?? port;
  const response = await requestNovaMasterEndpoint(actionPort, action.path, {
    method: action.method,
    body: action.body,
    timeoutMs: action.id === 'chat' ? 10000 : 3000,
  });
  const detail = summarizeNovaPayload(response.payload);
  const receipt = buildNovaMasterActionReceipt(action, detail, response.httpStatus);

  if (!response.httpStatus || response.httpStatus < 200 || response.httpStatus >= 300) {
    throw new Error(receipt);
  }

  return {
    serviceId,
    actionId: action.id,
    actionLabel: action.label,
    endpoint: `${action.method} ${action.path}`,
    httpStatus: response.httpStatus,
    latencyMs: response.latencyMs,
    detail,
    receipt,
  };
}

async function launchNovaMasterService(serviceId: string): Promise<Record<string, unknown>> {
  const probe = NOVAMASTER_PROBES.find((candidate) => candidate.id === serviceId);
  if (!probe) {
    throw new Error(`Unknown NovaMaster service: ${serviceId}`);
  }

  const port = await resolveNovaMasterPort(probe);
  const openUrl = resolveNovaMasterOpenUrl(probe, port);

  if (!probe.launchPath) {
    return {
      serviceId,
      launched: false,
      openUrl,
      reason: 'external-url-only',
    };
  }

  await fsPromises.access(probe.launchPath, fs.constants.X_OK);
  const cleanOpenUrl = openUrl.split('#')[0];
  const backendUrl = port ? `http://127.0.0.1:${port}` : cleanOpenUrl.replace(/\/?$/, '');
  const child = spawn(probe.launchPath, [], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ...(serviceId === 'claw3d'
        ? {
             CLAW3D_OFFICE_URL: openUrl,
             CLAW3D_OFFICE_BACKEND_URL: backendUrl,
             CLAW3D_OFFICE_HEALTH_URL: `${backendUrl}/api/health`,
           }
         : {}),
    },
  });
  child.unref();

  return {
    serviceId,
    launched: true,
    command: path.basename(probe.launchPath),
    openUrl,
  };
}

/**
 * Decode filename from multer.
 * Multer v2 decodes Content-Disposition filename as Latin-1 (per HTTP spec),
 * but browsers encode non-ASCII filenames (CJK, etc.) as UTF-8 bytes.
 * Re-encode the Latin-1 string back to raw bytes and decode as UTF-8.
 */
function decodeMulterFileName(raw: string): string {
  try {
    const bytes = Buffer.from(raw, 'latin1');
    return bytes.toString('utf8');
  } catch {
    return raw;
  }
}

function sanitizeFileName(fileName: string): string {
  const decoded = decodeMulterFileName(fileName);
  const basename = path.basename(decoded);
  const safe = basename.replace(/[<>:"/\\|?*]/g, '_');
  if (!safe || safe === '.' || safe === '..') return `file_${Date.now()}`;
  return safe;
}

function normalizeMountPath(input: string): string {
  if (!input || input.trim() === '') return '/';
  return input.startsWith('/') ? input : `/${input}`;
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedRoot = path.resolve(rootPath);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

export async function resolveUploadWorkspace(conversationId: string, requestedWorkspace?: string): Promise<string> {
  if (!conversationId) {
    throw new Error('Missing conversation id');
  }

  const db = await getDatabase();
  const result = db.getConversation(conversationId);
  const conversationWorkspace = result.data?.extra?.workspace;
  if (!result.success || !conversationWorkspace) {
    throw new Error('Conversation workspace not found');
  }

  const resolvedConversationWorkspace = path.resolve(conversationWorkspace);
  if (requestedWorkspace && path.resolve(requestedWorkspace) !== resolvedConversationWorkspace) {
    throw new Error('Workspace mismatch');
  }

  return resolvedConversationWorkspace;
}

async function getTempUploadDir(): Promise<string> {
  const { cacheDir } = getSystemDir();
  const tempDir = path.join(cacheDir, 'temp');
  await fsPromises.mkdir(tempDir, { recursive: true });
  return tempDir;
}

function resolveRouteHandler(moduleExports: unknown): RequestHandler | null {
  if (typeof moduleExports === 'function') {
    return moduleExports as RequestHandler;
  }

  if (!moduleExports || typeof moduleExports !== 'object') {
    return null;
  }

  const maybeDefault = (moduleExports as { default?: unknown }).default;
  if (typeof maybeDefault === 'function') {
    return maybeDefault as RequestHandler;
  }

  return null;
}

function wrapRouteHandler(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function runMiddlewareStack(req: Request, res: Response, next: NextFunction, stack: RequestHandler[]): void {
  let index = 0;
  const dispatch = (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    const current = stack[index++];
    if (!current) {
      return;
    }
    try {
      Promise.resolve(current(req, res, (middlewareErr?: unknown) => dispatch(middlewareErr))).catch(dispatch);
    } catch (error) {
      dispatch(error);
    }
  };
  dispatch();
}

type MatchedApiRoute = {
  extensionName: string;
  routePath: string;
  routeEntry: string;
  auth: boolean;
};

type MatchedStaticAsset = {
  extensionName: string;
  filePath: string;
};

function resolveMatchedApiRoute(requestPath: string): MatchedApiRoute | null {
  const registry = ExtensionRegistry.getInstance();
  const contributions = registry.getWebuiContributions();
  for (const contribution of contributions) {
    const extensionRoot = path.resolve(contribution.directory);
    for (const route of contribution.config.apiRoutes || []) {
      const routePath = normalizeMountPath(route.path);
      if (routePath !== requestPath) continue;
      const routeEntry = path.resolve(extensionRoot, route.entryPoint);
      if (!isPathInsideRoot(routeEntry, extensionRoot)) continue;
      return {
        extensionName: contribution.extensionName,
        routePath,
        routeEntry,
        auth: route.auth !== false,
      };
    }
  }
  return null;
}

function resolveMatchedStaticAsset(requestPath: string): MatchedStaticAsset | null {
  const registry = ExtensionRegistry.getInstance();
  const contributions = registry.getWebuiContributions();
  for (const contribution of contributions) {
    const extensionRoot = path.resolve(contribution.directory);
    for (const asset of contribution.config.staticAssets || []) {
      const urlPrefix = normalizeMountPath(asset.urlPrefix);
      if (!(requestPath === urlPrefix || requestPath.startsWith(`${urlPrefix}/`))) continue;
      const staticRoot = path.resolve(extensionRoot, asset.directory);
      if (!isPathInsideRoot(staticRoot, extensionRoot)) continue;

      const relativePart = requestPath.slice(urlPrefix.length);
      if (!relativePart || relativePart === '/') continue;
      const filePath = path.resolve(staticRoot, `.${relativePart}`);
      if (!isPathInsideRoot(filePath, staticRoot)) continue;
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
      return { extensionName: contribution.extensionName, filePath };
    }
  }
  return null;
}

function registerExtensionWebuiRoutes(app: Express, validateApiAccess: RequestHandler): void {
  // eslint-disable-next-line no-eval
  const nativeRequire = eval('require') as NodeRequire;

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestPath = normalizeMountPath(req.path || '/');

    const staticMatch = resolveMatchedStaticAsset(requestPath);
    if (staticMatch) {
      const stack: RequestHandler[] = [
        apiRateLimiter,
        (_req, response, middlewareNext) => {
          response.setHeader('Cache-Control', 'public, max-age=3600');
          middlewareNext();
        },
        (_req, response, middlewareNext) => {
          response.sendFile(staticMatch.filePath, (error) => {
            if (error) middlewareNext(error);
          });
        },
      ];
      runMiddlewareStack(req, res, next, stack);
      return;
    }

    const routeMatch = resolveMatchedApiRoute(requestPath);
    if (!routeMatch) {
      // Extension namespaces should not silently fall through to the SPA handler.
      // This prevents disabled/unknown extension routes from returning 200 HTML.
      if (/^\/ext-[a-z0-9-]+(?:\/|$)/i.test(requestPath)) {
        res.status(404).json({ message: 'Extension route not found' });
        return;
      }
      next();
      return;
    }

    let routeModule: unknown;
    try {
      routeModule = nativeRequire(routeMatch.routeEntry);
    } catch (error) {
      console.error(
        `[WebUI] Failed to load API route module: ${routeMatch.routeEntry} (${routeMatch.extensionName})`,
        error
      );
      res.status(500).json({ message: 'Failed to load extension API route' });
      return;
    }

    const handler = resolveRouteHandler(routeModule);
    if (!handler) {
      console.warn(`[WebUI] API route has no function export: ${routeMatch.routeEntry} (${routeMatch.extensionName})`);
      res.status(500).json({ message: 'Invalid extension API route handler' });
      return;
    }

    const stack: RequestHandler[] = [apiRateLimiter];
    if (routeMatch.auth) {
      stack.push(validateApiAccess);
    }
    stack.push(wrapRouteHandler(handler));
    runMiddlewareStack(req, res, next, stack);
  });
}

/**
 * 注册 API 路由
 * Register API routes
 */
export function registerApiRoutes(app: Express): void {
  const validateApiAccess = TokenMiddleware.validateToken({
    responseType: 'json',
  });

  /**
   * 目录 API - Directory API
   * /api/directory/*
   */
  app.use('/api/directory', apiRateLimiter, validateApiAccess, directoryApi);

  /**
   * NovaMaster provider credits/status cache.
   * Safe read-only endpoint: returns only provider status, billing links, and sanitized quota fields.
   */
  app.get('/api/novamaster/provider-credits', apiRateLimiter, async (_req: Request, res: Response) => {
    try {
      const cachePath = path.join(os.homedir(), '.cache/clawmem/novamaster-receipts/provider-credits/latest.json');
      const raw = await fsPromises.readFile(cachePath, 'utf8');
      res.type('application/json').send(raw);
    } catch {
      res.status(404).json({
        success: false,
        msg: 'Provider credits cache not found. Run nova-provider-credits refresh.',
        path: '~/.cache/clawmem/novamaster-receipts/provider-credits/latest.json',
      });
    }
  });

  app.post(
    '/api/novamaster/provider-credits/refresh',
    apiRateLimiter,
    validateApiAccess,
    authenticatedActionLimiter,
    wrapRouteHandler(async (req: Request, res: Response) => {
      if (!isLoopbackRequest(req)) {
        res.status(403).json({ ok: false, error: 'loopback_only' });
        return;
      }

      const proc = spawn('/home/faramix/bin/nova-provider-credits', ['refresh'], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (chunk) => {
        stdout += String(chunk);
      });
      proc.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
      });
      const code = await new Promise<number | null>((resolve) => {
        proc.on('close', resolve);
      });
      res.status(code === 0 ? 200 : 500).json({
        ok: code === 0,
        code,
        output: stdout.slice(-3000),
        error: stderr.slice(-1000),
      });
    })
  );

  /**
   * Localhost integration key vault fallback.
   * Used by standalone WebUI when the IPC bridge is unavailable or slow.
   * Values are write-only: this endpoint never returns stored secrets.
   */
  app.post(
    '/api/novamaster/integration-key',
    apiRateLimiter,
    validateApiAccess,
    authenticatedActionLimiter,
    wrapRouteHandler(async (req: Request, res: Response) => {
      const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
      const value = typeof req.body?.value === 'string' ? req.body.value.trim() : '';
      const dryRun = req.body?.dryRun === true;

      if (!isLoopbackRequest(req)) {
        res.status(403).json({ ok: false, error: 'loopback_only' });
        return;
      }

      if (!(INTEGRATION_KEY_ALLOWLIST as readonly string[]).includes(key)) {
        res.status(400).json({ ok: false, error: 'key_not_allowed' });
        return;
      }

      if (!value) {
        res.status(400).json({ ok: false, error: 'empty_value' });
        return;
      }

      if (dryRun) {
        res.json({ ok: true, key, stored: false, dryRun: true });
        return;
      }

      const currentRaw = await ProcessConfig.get('integration.keys');
      const current = currentRaw && typeof currentRaw === 'object' && !Array.isArray(currentRaw) ? currentRaw : {};
      await ProcessConfig.set('integration.keys', { ...current, [key]: value });
      res.json({ ok: true, key, stored: true });
    })
  );

  /**
   * 上传文件 - Upload file
   * POST /api/upload
   * WebUI 模式下粘贴/拖拽/选择文件时，通过 HTTP multipart 上传到 workspace
   * Used in WebUI mode for paste/drag/pick files via HTTP multipart upload
   *
   * Must be registered BEFORE extension webui routes and catch-all /api route
   *
   * NOTE: multer v2 passes file-size errors to Express's next() rather than
   * throwing inside the route handler. We wrap upload.single() manually so
   * LIMIT_FILE_SIZE is intercepted and returns 413 before entering the handler.
   */
  app.post(
    '/api/upload',
    apiRateLimiter,
    validateApiAccess,
    (req: Request, res: Response, next: NextFunction) => {
      uploadDisk.single('file')(req, res, (err: unknown) => {
        if (err) {
          next(err);
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const file = req.file;
        const conversationId = typeof req.body.conversationId === 'string' ? req.body.conversationId : '';
        const requestedWorkspace = typeof req.body.workspace === 'string' ? req.body.workspace : '';

        if (!file) {
          res.status(400).json({ success: false, msg: 'Missing file' });
          return;
        }

        let uploadDir: string;
        // Check user preference: save to workspace or cache directory
        // Default to cache directory (false) to avoid cluttering workspace
        const saveToWorkspace = await ProcessConfig.get('upload.saveToWorkspace').catch(() => false);
        if (conversationId && saveToWorkspace) {
          let workspace: string;
          try {
            workspace = await resolveUploadWorkspace(conversationId, requestedWorkspace);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid upload workspace';
            const statusCode =
              message === 'Conversation workspace not found' || message === 'Missing conversation id' ? 400 : 403;
            res.status(statusCode).json({ success: false, msg: message });
            return;
          }
          uploadDir = path.join(workspace, 'uploads');
          await fsPromises.mkdir(uploadDir, { recursive: true });
        } else {
          if (requestedWorkspace) {
            res.status(403).json({
              success: false,
              msg: 'Workspace uploads require conversation id',
            });
            return;
          }
          uploadDir = await getTempUploadDir();
        }

        const safeFileName = sanitizeFileName(file.originalname);
        let targetPath = path.join(uploadDir, safeFileName);

        // Check for duplicate and append timestamp if needed
        try {
          await fsPromises.access(targetPath);
          // File exists, append timestamp
          const ext = path.extname(safeFileName);
          const name = path.basename(safeFileName, ext);
          targetPath = path.join(uploadDir, `${name}${AIONUI_TIMESTAMP_SEPARATOR}${Date.now()}${ext}`);
        } catch {
          // File doesn't exist, proceed with original name
        }

        // Verify path is still within uploadDir (defense in depth)
        const resolvedTarget = path.resolve(targetPath);
        const resolvedUploadDir = path.resolve(uploadDir);
        if (!resolvedTarget.startsWith(resolvedUploadDir + path.sep) && resolvedTarget !== resolvedUploadDir) {
          res.status(400).json({ success: false, msg: 'Invalid file name' });
          return;
        }

        // Reconstruct the source path from a trusted base + only the filename component of file.path.
        // This breaks the taint chain: path.basename() strips any directory traversal sequences,
        // and MULTER_TEMP_DIR is a constant set at startup, not user-provided.
        const safeTempPath = path.join(path.resolve(MULTER_TEMP_DIR), path.basename(file.path));
        await fsPromises.rename(safeTempPath, targetPath);

        res.json({
          success: true,
          data: {
            path: targetPath,
            name: path.basename(targetPath),
            size: file.size,
            type: file.mimetype || 'application/octet-stream',
          },
        });
      } catch (error) {
        console.error('[API] Upload file error:', error);
        res.status(500).json({
          success: false,
          msg: error instanceof Error ? error.message : 'Failed to upload file',
        });
      }
    }
  );

  app.post(
    '/api/stt',
    apiRateLimiter,
    validateApiAccess,
    (req: Request, res: Response, next: NextFunction) => {
      uploadAudio.single('audio')(req, res, (err: unknown) => {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            success: false,
            msg: `Audio file too large (max ${MAX_AUDIO_SIZE / 1024 / 1024}MB)`,
          });
          return;
        }
        if (err) {
          next(err);
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const audio = req.file;
        const languageHint = typeof req.body.languageHint === 'string' ? req.body.languageHint : undefined;
        const mimeType =
          typeof req.body.mimeType === 'string' && req.body.mimeType.trim().length > 0
            ? req.body.mimeType
            : audio?.mimetype || 'application/octet-stream';

        if (!audio) {
          res.status(400).json({ success: false, msg: 'Missing audio file' });
          return;
        }

        const result = await SpeechToTextService.transcribe({
          audioBuffer: Uint8Array.from(audio.buffer),
          fileName: sanitizeFileName(audio.originalname || `speech-${Date.now()}.webm`),
          languageHint,
          mimeType,
        });

        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error('[API] Speech-to-text error:', error);
        res.status(500).json({
          success: false,
          msg: error instanceof Error ? error.message : 'Speech-to-text failed',
        });
      }
    }
  );

  app.get('/api/novamaster/stack', apiRateLimiter, async (_req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: await getNovaMasterStackStatus(),
      });
    } catch (error) {
      console.error('[API] NovaMaster stack status error:', error);
      res.status(500).json({
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to read NovaMaster stack status',
      });
    }
  });

  app.get('/api/novamaster/models', apiRateLimiter, async (_req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: await readNovaMasterModelRouter(),
      });
    } catch (error) {
      console.error('[API] NovaMaster model router error:', error);
      res.status(500).json({
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to read NovaMaster model router',
      });
    }
  });

  app.post(
    '/api/novamaster/models/select',
    apiRateLimiter,
    wrapRouteHandler(async (req: Request, res: Response) => {
      const modelId = typeof req.body?.modelId === 'string' ? req.body.modelId.trim() : '';
      try {
        res.json({
          success: true,
          data: await selectNovaMasterModel(modelId),
        });
      } catch (error) {
        console.error('[API] NovaMaster model select error:', error);
        res.status(400).json({
          success: false,
          msg: error instanceof Error ? error.message : 'Failed to select NovaMaster model',
        });
      }
    })
  );

  app.get('/api/novamaster/agents/roles', apiRateLimiter, async (_req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: await readNovaMasterAgentCatalog(),
      });
    } catch (error) {
      console.error('[API] NovaMaster agent roles error:', error);
      res.status(500).json({
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to read NovaMaster agent roles',
      });
    }
  });

  app.get('/api/novamaster/agents/tasks', apiRateLimiter, async (_req: Request, res: Response) => {
    try {
      const response = await requestNovaMasterEndpoint(JARVIS_AGENTS_PORT, '/agents/tasks', { timeoutMs: 1800 });
      if (!response.httpStatus || response.httpStatus < 200 || response.httpStatus >= 300) {
        res.status(502).json({
          success: false,
          msg: `Jarvis agents returned HTTP ${response.httpStatus ?? 'unknown'}`,
          data: response.payload,
        });
        return;
      }

      res.json({
        success: true,
        data: response.payload,
      });
    } catch (error) {
      console.error('[API] NovaMaster agent tasks error:', error);
      res.status(500).json({
        success: false,
        msg: error instanceof Error ? error.message : 'Failed to read NovaMaster agent tasks',
      });
    }
  });

  app.post(
    '/api/novamaster/agents/spawn-team',
    apiRateLimiter,
    validateApiAccess,
    wrapRouteHandler(async (req: Request, res: Response) => {
      const body = toRecord(req.body) ?? {};
      const team = typeof body.team === 'string' ? body.team.trim().toLowerCase() : '';
      const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
      const rawPriority = typeof body.priority === 'string' ? body.priority.trim().toLowerCase() : 'normal';
      const priority = ['low', 'normal', 'high'].includes(rawPriority) ? rawPriority : 'normal';
      let dryRun = false;
      if (typeof body.dryRun === 'boolean') {
        dryRun = body.dryRun;
      } else if (typeof body.dry_run === 'boolean') {
        dryRun = body.dry_run;
      }

      if (!goal) {
        res.status(400).json({ success: false, msg: 'goal is required' });
        return;
      }

      const catalog = await readNovaMasterAgentCatalog();
      if (!team || !catalog.teams.includes(team)) {
        res.status(400).json({
          success: false,
          msg: `unsupported team: ${team || 'missing'}`,
          data: { teams: catalog.teams },
        });
        return;
      }

      try {
        const response = await requestNovaMasterEndpoint(JARVIS_AGENTS_PORT, '/agents/spawn-team', {
          method: 'POST',
          timeoutMs: 5000,
          body: {
            team,
            goal: goal.slice(0, 3000),
            priority,
            dry_run: dryRun,
          },
        });
        const ok = Boolean(response.httpStatus && response.httpStatus >= 200 && response.httpStatus < 300);

        res.status(ok ? 202 : 502).json({
          success: ok,
          ...(ok ? {} : { msg: `Jarvis agents returned HTTP ${response.httpStatus ?? 'unknown'}` }),
          data: response.payload,
        });
      } catch (error) {
        console.error('[API] NovaMaster agent team spawn error:', error);
        res.status(500).json({
          success: false,
          msg: error instanceof Error ? error.message : 'Failed to spawn NovaMaster agent team',
        });
      }
    })
  );

  app.get(
    '/api/novamaster/services/:serviceId/open',
    apiRateLimiter,
    wrapRouteHandler(async (req: Request, res: Response) => {
      try {
        res.json({
          success: true,
          data: await launchNovaMasterService(String(req.params.serviceId)),
        });
      } catch (error) {
        console.error('[API] NovaMaster service launch error:', error);
        res.status(500).json({
          success: false,
          msg: error instanceof Error ? error.message : 'Failed to launch NovaMaster service',
        });
      }
    })
  );

  app.get(
    '/api/novamaster/services/:serviceId/action',
    apiRateLimiter,
    wrapRouteHandler(async (req: Request, res: Response) => {
      try {
        res.json({
          success: true,
          data: await runNovaMasterServiceAction(String(req.params.serviceId)),
        });
      } catch (error) {
        console.error('[API] NovaMaster service action error:', error);
        res.status(500).json({
          success: false,
          msg: error instanceof Error ? error.message : 'Failed to run NovaMaster service action',
        });
      }
    })
  );

  registerWecomChannelRoutes(app);

  registerExtensionWebuiRoutes(app, validateApiAccess);

  /**
   * 扩展资产 API（WebUI）- Extension asset API (WebUI)
   * GET /api/ext-asset?path={absolutePath}
   */
  app.get('/api/ext-asset', apiRateLimiter, validateApiAccess, (req: Request, res: Response) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    if (!rawPath) {
      return res.status(400).json({ message: 'Missing path query parameter' });
    }

    const normalizedPath = path.resolve(rawPath);
    const registry = ExtensionRegistry.getInstance();
    const allowedRoots = registry.getLoadedExtensions().map((ext) => path.resolve(ext.directory));

    // Find which trusted root contains this path
    const matchingRoot = allowedRoots.find(
      (root) => normalizedPath === root || normalizedPath.startsWith(`${root}${path.sep}`)
    );

    if (!matchingRoot) {
      return res.status(403).json({
        message: 'Access denied: path is outside extension directories',
      });
    }

    // Reconstruct path from the trusted root so CodeQL can verify no path traversal occurs.
    // path.relative() computes the relative portion; verifying it doesn't start with '..'
    // confirms containment; path.join() re-anchors to the trusted base.
    const relativePath = path.relative(matchingRoot, normalizedPath);
    if (relativePath.startsWith('..')) {
      return res.status(403).json({
        message: 'Access denied: path is outside extension directories',
      });
    }

    const safePath = path.join(matchingRoot, relativePath);

    if (!fs.existsSync(safePath) || !fs.statSync(safePath).isFile()) {
      return res.status(404).json({ message: 'Asset not found' });
    }

    return res.sendFile(safePath);
  });

  /**
   * Shared reverse proxy handler for officecli watch servers.
   *
   * Guards against SSRF by validating the port against active sessions.
   * Rewrites Location headers and injects a navigation guard script into HTML
   * responses so the preview iframe cannot escape the proxy base path.
   */
  function registerOfficecliWatchProxy(
    routePath: string,
    portValidator: (port: number) => boolean,
    sessionLabel: string
  ): void {
    app.use(routePath + '/:port', apiRateLimiter, validateApiAccess, (req: Request, res: Response) => {
      const port = parseInt(req.params.port as string, 10);
      if (isNaN(port) || !portValidator(port)) {
        res.status(404).json({ message: `${sessionLabel} session not found` });
        return;
      }

      const subPath = req.path || '/';
      const queryIndex = req.url.indexOf('?');
      const query = queryIndex !== -1 ? req.url.slice(queryIndex) : '';

      // Strip hop-by-hop headers and auth before forwarding to local officecli server
      const hopByHop = new Set([
        'connection',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailer',
        'transfer-encoding',
        'upgrade',
        'cookie',
        'authorization',
      ]);
      const proxyHeaders: Record<string, string | string[]> = { host: `127.0.0.1:${port}` };
      for (const [key, value] of Object.entries(req.headers)) {
        if (!hopByHop.has(key.toLowerCase()) && value !== undefined) {
          proxyHeaders[key] = value as string | string[];
        }
      }

      const proxyReq = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: subPath + query,
          method: req.method,
          headers: proxyHeaders,
          timeout: 30_000,
        },
        (proxyRes) => {
          const statusCode = proxyRes.statusCode ?? 200;

          // Rewrite Location headers so the browser follows redirects through the proxy
          // instead of hitting http://localhost:PORT directly (which the browser can't reach).
          const responseHeaders: Record<string, string | string[]> = {};
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (key.toLowerCase() === 'location' && typeof value === 'string') {
              // Rewrite absolute localhost URLs
              let rewritten = value.replace(
                new RegExp(`^https?://(?:localhost|127\\.0\\.0\\.1):${port}`),
                `${routePath}/${port}`
              );
              // Also rewrite root-relative paths (e.g. Location: /) through the proxy
              if (rewritten === '/' || (rewritten.startsWith('/') && !rewritten.startsWith(routePath))) {
                rewritten = `${routePath}/${port}${rewritten === '/' ? '/' : rewritten}`;
              }
              responseHeaders[key] = rewritten;
            } else if (value !== undefined) {
              responseHeaders[key] = value as string | string[];
            }
          }
          // Override global X-Frame-Options: deny so the proxy URL can be loaded inside an iframe.
          // The injected guard script prevents the iframe from navigating outside the proxy base path.
          // cspell:ignore SAMEORIGIN
          responseHeaders['x-frame-options'] = 'SAMEORIGIN';

          // For HTML responses, buffer and inject a navigation guard script so that
          // the preview page JS cannot navigate the iframe to the root app URL.
          const contentType = String(responseHeaders['content-type'] ?? '');
          if (contentType.includes('text/html')) {
            const proxyBase = `${routePath}/${port}`;
            // Injected as the first script in <head> so it runs before any page scripts.
            const guardScript = `<script>
(function(b){
  function rw(u){if(!u)return u;var s=String(u);var m=/^https?:\\/\\/(?:localhost|127\\.0\\.0\\.1)(:\\d+)?(\\/.*)?$/.exec(s);if(m){var p=m[2]||'/';if(!p.startsWith(b))return b+(p==='/'?'/':p);}if(s==='/'||(s[0]==='/'&&s[1]!=='/'&&!s.startsWith(b)))return b+(s==='/'?'/':s);return s;}
  var _a=location.assign.bind(location),_r=location.replace.bind(location);
  location.assign=function(u){_a(rw(u));};location.replace=function(u){_r(rw(u));};
  var _ps=history.pushState.bind(history),_rs=history.replaceState.bind(history);
  history.pushState=function(s,t,u){_ps(s,t,u?rw(u):u);};history.replaceState=function(s,t,u){_rs(s,t,u?rw(u):u);};
  try{Object.defineProperty(location,'href',{set:function(v){_a(rw(v));},configurable:true});}catch(e){}
  document.addEventListener('click',function(e){var t=e.target;while(t&&t.tagName!=='A')t=t.parentElement;if(t&&t.tagName==='A'){var h=t.getAttribute('href');if(h&&(h[0]==='/'&&h[1]!=='/'&&!h.startsWith(b))){e.preventDefault();_a(b+h);}}},true);
})('${proxyBase}');
</script>`;

            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              let html = Buffer.concat(chunks).toString('utf8');
              // Inject right after opening <head> tag so the guard runs first
              if (/<head[^>]*>/i.test(html)) {
                html = html.replace(/(<head[^>]*>)/i, `$1${guardScript}`);
              } else {
                html = guardScript + html;
              }
              delete responseHeaders['content-length']; // length changed after injection
              res.removeHeader('X-Frame-Options');
              res.writeHead(statusCode, responseHeaders);
              res.end(html);
            });
            proxyRes.on('error', () => {
              if (!res.headersSent) res.status(502).end();
            });
          } else {
            res.removeHeader('X-Frame-Options');
            res.writeHead(statusCode, responseHeaders);
            proxyRes.on('error', () => {
              // headers already sent via writeHead — can't change status, just destroy
              res.destroy();
            });
            proxyRes.pipe(res, { end: true });
          }
        }
      );

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) res.status(504).json({ message: `${sessionLabel} proxy timeout` });
      });

      proxyReq.on('error', () => {
        if (!res.headersSent) res.status(502).json({ message: `${sessionLabel} proxy error` });
      });

      req.pipe(proxyReq, { end: true });
    });
  }

  /**
   * PPT 预览反向代理 - PPT Preview Reverse Proxy
   * GET /api/ppt-proxy/:port/*
   */
  registerOfficecliWatchProxy('/api/ppt-proxy', isActivePreviewPort, 'PPT preview');

  /**
   * Office Watch 预览反向代理 (Word & Excel) - Office Watch Preview Reverse Proxy
   * GET /api/office-watch-proxy/:port/*
   */
  registerOfficecliWatchProxy('/api/office-watch-proxy', isActiveOfficeWatchPort, 'Office watch preview');

  /**
   * WeChat QR-code login (WebUI mode)
   * GET /api/channel/weixin/login
   */
  registerWeixinLoginRoutes(app, validateApiAccess);

  /**
   * 通用 API 端点 - Generic API endpoint
   * GET /api
   */
  app.use('/api', apiRateLimiter, validateApiAccess, (_req: Request, res: Response) => {
    res.json({ message: 'API endpoint - bridge integration working' });
  });
}

export default registerApiRoutes;
