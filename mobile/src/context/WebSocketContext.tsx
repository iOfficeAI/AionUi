import React, { createContext, useContext, useEffect } from 'react';
import { AppState } from 'react-native';
import { bridge } from '../services/bridge';
import { wsService } from '../services/websocket';

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
  // Reconnect when app returns to foreground if disconnected
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && wsService.state === 'disconnected') {
        wsService.reconnect();
      }
    });
    return () => sub.remove();
  }, []);

  return <WebSocketContext.Provider value={{ bridge, wsService }}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}

export function useBridge() {
  return useContext(WebSocketContext).bridge;
}
