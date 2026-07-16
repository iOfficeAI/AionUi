/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type ServiceStatus = 'online' | 'offline' | 'degraded' | 'checking';

export interface ServiceEntry {
  id: string;
  name: string;
  url: string;
  status: ServiceStatus;
  latencyMs?: number;
  lastChecked?: number;
}

const POLL_INTERVAL = 30_000;
const TIMEOUT_MS = 3_000;

const SERVICES: Array<{ id: string; name: string; url: string }> = [
  { id: 'hermes', name: 'Hermes', url: 'http://127.0.0.1:8644/health' },
  { id: 'openclaw', name: 'OpenClaw', url: 'http://127.0.0.1:18793/health' },
  { id: 'clawmem', name: 'ClawMem', url: 'http://127.0.0.1:7438/health' },
  { id: 'ollama', name: 'Ollama', url: 'http://127.0.0.1:11434/api/tags' },
  { id: 'litellm', name: 'LiteLLM', url: 'http://127.0.0.1:4000/health/readiness' },
  { id: 'voice', name: 'Voice', url: 'http://127.0.0.1:8098/health' },
  { id: 'n8n', name: 'n8n', url: 'http://127.0.0.1:5678/healthz' },
  { id: 'space', name: 'Space', url: 'http://127.0.0.1:3003/' },
  { id: 'open-notebook', name: 'Open Notebook', url: 'http://127.0.0.1:5055/health' },
];

interface ServiceHealthState {
  services: ServiceEntry[];
  onlineCount: number;
  totalCount: number;
}

const ServiceHealthContext = createContext<ServiceHealthState>({
  services: [],
  onlineCount: 0,
  totalCount: 0,
});

export const useServiceHealth = () => useContext(ServiceHealthContext);

async function checkService(entry: (typeof SERVICES)[number]): Promise<ServiceEntry> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(entry.url, { signal: controller.signal, mode: 'no-cors' });
    clearTimeout(timer);
    const latencyMs = Math.round(performance.now() - start);
    // no-cors: opaque response (type 'opaque') means server is reachable
    const status: ServiceStatus = res.type === 'opaque' || res.ok ? 'online' : 'offline';
    return { ...entry, status, latencyMs, lastChecked: Date.now() };
  } catch {
    return { ...entry, status: 'offline', lastChecked: Date.now() };
  }
}

export const ServiceHealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [services, setServices] = useState<ServiceEntry[]>(
    SERVICES.map((s) => ({ ...s, status: 'checking' }))
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    const poll = async () => {
      const results = await Promise.all(SERVICES.map(checkService));
      if (mountedRef.current) {
        setServices(results);
      }
    };
    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, []);

  const onlineCount = services.filter((s) => s.status === 'online').length;
  const value = useMemo(
    () => ({ services, onlineCount, totalCount: services.length }),
    [onlineCount, services]
  );

  return (
    <ServiceHealthContext.Provider value={value}>
      {children}
    </ServiceHealthContext.Provider>
  );
};

export default ServiceHealthContext;
