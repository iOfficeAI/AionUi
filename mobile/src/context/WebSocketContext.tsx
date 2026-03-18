import React, { createContext, useContext } from 'react';
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
  return <WebSocketContext.Provider value={{ bridge, wsService }}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}

export function useBridge() {
  return useContext(WebSocketContext).bridge;
}
