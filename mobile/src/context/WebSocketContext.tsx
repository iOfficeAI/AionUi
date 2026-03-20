import React, { createContext, useContext, useEffect } from 'react';
import { AppState } from 'react-native';
import { bridge } from '../services/bridge';
import { wsService } from '../services/websocket';
import { useConnection } from './ConnectionContext';

type WebSocketContextType = {
  bridge: typeof bridge;
  wsService: typeof wsService;
};

const WebSocketContext = createContext<WebSocketContextType>({
  bridge,
  wsService,
});

/**
 * Provides access to the bridge service and wsService singleton.
 * Wrap your app with this so components can access the bridge.
 */
export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { tryReconnect } = useConnection();

  // Reconnect when app returns to foreground if disconnected or auth_failed
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (wsService.state === 'auth_failed') {
          tryReconnect();
        } else if (wsService.state === 'disconnected') {
          wsService.reconnect();
        }
      }
    });
    return () => sub.remove();
  }, [tryReconnect]);

  return <WebSocketContext.Provider value={{ bridge, wsService }}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}

export function useBridge() {
  return useContext(WebSocketContext).bridge;
}
