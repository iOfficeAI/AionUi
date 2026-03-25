import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { wsService, type ConnectionState } from '../services/websocket';
import { configureApi, resetApi, refreshToken } from '../services/api';
import { decodeJwtPayload } from '../utils/jwt';

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
  tryReconnect: () => void;
  isConfigured: boolean;
  isRestoring: boolean;
};

const ConnectionContext = createContext<ConnectionContextType>({
  config: null,
  connectionState: 'disconnected',
  connect: async () => {},
  disconnect: () => {},
  tryReconnect: () => {},
  isConfigured: false,
  isRestoring: true,
});

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isRestoring, setIsRestoring] = useState(true);
  const configRef = useRef<ConnectionConfig | null>(null);
  const isRecoveringRef = useRef(false);

  // Keep configRef in sync
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Attempt token refresh and reconnect; returns true on success
  const attemptTokenRecovery = useCallback(async (): Promise<boolean> => {
    const currentConfig = configRef.current;
    if (!currentConfig) return false;

    const newToken = await refreshToken(currentConfig.token);
    if (!newToken) return false;

    const newConfig = { ...currentConfig, token: newToken };
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(newConfig));
    setConfig(newConfig);

    configureApi(newConfig.host, newConfig.port, newConfig.token);
    wsService.updateToken(newToken);
    wsService.configure(newConfig.host, newConfig.port, newConfig.token);
    wsService.reconnect();
    return true;
  }, []);

  // Check token expiry on each heartbeat and refresh if needed
  const checkAndRefreshToken = useCallback(() => {
    const currentConfig = configRef.current;
    if (!currentConfig) return;

    const payload = decodeJwtPayload(currentConfig.token);
    if (!payload?.exp) return;

    const remainingMs = payload.exp * 1000 - Date.now();
    if (remainingMs > 3600_000) return; // More than 1 hour left, no action needed

    // Token expires within 1 hour — refresh proactively
    refreshToken(currentConfig.token)
      .then(async (newToken) => {
        if (!newToken) {
          console.warn('[Connection] Heartbeat token refresh failed, will retry next heartbeat');
          return;
        }

        const newConfig = { ...currentConfig, token: newToken };
        await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(newConfig));
        setConfig(newConfig);

        configureApi(newConfig.host, newConfig.port, newConfig.token);
        wsService.updateToken(newToken);
        wsService.configure(newConfig.host, newConfig.port, newConfig.token);
      })
      .catch(() => {
        console.warn('[Connection] Heartbeat token refresh error, will retry next heartbeat');
      });
  }, []);

  // Register auth challenge handler and heartbeat handler on mount
  useEffect(() => {
    wsService.setAuthChallengeHandler(async () => {
      if (isRecoveringRef.current) return false;
      isRecoveringRef.current = true;
      try {
        return await attemptTokenRecovery();
      } finally {
        isRecoveringRef.current = false;
      }
    });
    wsService.setHeartbeatHandler(checkAndRefreshToken);
    return () => {
      wsService.setAuthChallengeHandler(null);
      wsService.setHeartbeatHandler(null);
    };
  }, [attemptTokenRecovery, checkAndRefreshToken]);

  const tryReconnect = useCallback(() => {
    if (isRecoveringRef.current) return;

    if (wsService.state === 'auth_failed') {
      isRecoveringRef.current = true;
      attemptTokenRecovery()
        .then((ok) => {
          if (!ok) {
            // Token refresh failed — remain in auth_failed
            console.warn('[Connection] Manual recovery failed');
          }
        })
        .catch(() => {})
        .finally(() => {
          isRecoveringRef.current = false;
        });
    } else if (wsService.state === 'disconnected') {
      wsService.reconnect();
    }
  }, [attemptTokenRecovery]);

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
    },
    [],
  );

  const disconnect = useCallback(() => {
    wsService.disconnect();
    resetApi();
    setConfig(null);
    SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
  }, []);

  return (
    <ConnectionContext.Provider
      value={{
        config,
        connectionState,
        connect,
        disconnect,
        tryReconnect,
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
