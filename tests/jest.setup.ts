/**
 * Jest Test Setup
 * Global configuration for MCP integration tests
 */

// Jest types are automatically available

// Make this a module
export {};

// Extend global types for testing
declare global {
  // eslint-disable-next-line no-var
  var electronAPI: any;
}

// Mock Electron APIs for testing
(global as any).electronAPI = {
  ipcRenderer: {
    invoke: () => Promise.resolve(),
    on: () => {},
    removeAllListeners: () => {},
  },
};
