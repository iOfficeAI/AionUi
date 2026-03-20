import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { wsService, type ConnectionState } from '../services/websocket';
import { configureApi, resetApi, refreshToken } from '../services/api';

const STORAGE_KEY = 'aionui_connection';

type ConnectionConfig = {
  host: string;
  port: string;
  token: string;
};

type ConnectionContextType = {
  config: ConnectionConfig | null;
  connectionState: ConnectionState;
  connect: (host: string, port: string, token: string) => Promise<void>;
  disconnect: () => void;
  isConfigured: boolean;
  isRestoring: boolean;
};

const ConnectionContext = createContext<ConnectionContextType>({
  config: null,
  connectionState: 'disconnected',
  connect: async () => {},
  disconnect: () => {},
  isConfigured: false,
  isRestoring: true,
});

/**
 * Decode JWT payload without importing a library.
 * Returns the parsed payload object, or null on failure.
 */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Base64url → base64
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isRestoring, setIsRestoring] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleTokenRefresh = useCallback(
    (token: string, currentConfig: ConnectionConfig) => {
      clearRefreshTimer();
      const payload = decodeJwtPayload(token);
      if (!payload?.exp) return;

      // Refresh 1 hour before expiry, but at least 1 minute from now
      const refreshAt = payload.exp * 1000 - 3600_000;
      const delay = Math.max(refreshAt - Date.now(), 60_000);

      refreshTimerRef.current = setTimeout(async () => {
        const newToken = await refreshToken(token);
        if (!newToken) {
          console.warn('[Connection] Token refresh failed');
          return;
        }

        // Update stored config
        const newConfig = { ...currentConfig, token: newToken };
        await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(newConfig));
        setConfig(newConfig);

        // Reconfigure services and reconnect
        configureApi(newConfig.host, newConfig.port, newConfig.token);
        wsService.configure(newConfig.host, newConfig.port, newConfig.token);
        wsService.reconnect();

        // Schedule next refresh
        scheduleTokenRefresh(newToken, newConfig);
      }, delay);
    },
    [clearRefreshTimer],
  );

  // Listen to WS state changes
  useEffect(() => {
    const unsub = wsService.onStateChange(setConnectionState);
    return unsub;
  }, []);

  // Restore saved connection on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as ConnectionConfig;
          setConfig(parsed);
          configureApi(parsed.host, parsed.port, parsed.token);
          wsService.configure(parsed.host, parsed.port, parsed.token);
          wsService.connect();
          scheduleTokenRefresh(parsed.token, parsed);
        }
      } catch {
        // No saved config or invalid
      } finally {
        setIsRestoring(false);
      }
    })();
  }, []);

  const connect = useCallback(
    async (host: string, port: string, token: string) => {
      const newConfig: ConnectionConfig = { host, port, token };

      // Persist to secure storage
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(newConfig));

      // Configure services
      setConfig(newConfig);
      configureApi(host, port, token);
      wsService.configure(host, port, token);
      wsService.connect();
      scheduleTokenRefresh(token, newConfig);
    },
    [scheduleTokenRefresh],
  );

  const disconnect = useCallback(() => {
    clearRefreshTimer();
    wsService.disconnect();
    resetApi();
    setConfig(null);
    SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
  }, [clearRefreshTimer]);

  return (
    <ConnectionContext.Provider
      value={{
        config,
        connectionState,
        connect,
        disconnect,
        isConfigured: config !== null,
        isRestoring,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  return useContext(ConnectionContext);
}
