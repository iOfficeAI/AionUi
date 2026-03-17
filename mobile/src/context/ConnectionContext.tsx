import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { wsService, type ConnectionState } from '../services/websocket';
import { configureApi, resetApi } from '../services/api';

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

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isRestoring, setIsRestoring] = useState(true);

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

  const connect = useCallback(async (host: string, port: string, token: string) => {
    const newConfig: ConnectionConfig = { host, port, token };

    // Persist to secure storage
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(newConfig));

    // Configure services
    setConfig(newConfig);
    configureApi(host, port, token);
    wsService.configure(host, port, token);
    wsService.connect();
  }, []);

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
