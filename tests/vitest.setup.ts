/**
 * Vitest Test Setup
 * Global configuration for extension system tests
 */

// Register NodePlatformServices so modules that call getPlatformServices() work in tests.
import { registerPlatformServices } from '@/common/platform';
import { NodePlatformServices } from '@/common/platform/NodePlatformServices';
registerPlatformServices(new NodePlatformServices());

// Make this a module

// Extend global types for testing
declare global {
  // eslint-disable-next-line no-var
  var electronAPI: any;
  // eslint-disable-next-line no-var
  var localStorage: Storage;
  // eslint-disable-next-line no-var
  var window: Window & typeof globalThis;
}

const noop = () => Promise.resolve();

// Mock Electron APIs for testing
const windowControlsMock = {
  minimize: noop,
  maximize: noop,
  unmaximize: noop,
  close: noop,
  isMaximized: () => Promise.resolve(false),
  onMaximizedChange: (): (() => void) => () => void 0,
};

(global as any).electronAPI = {
  emit: noop,
  on: () => {},
  windowControls: windowControlsMock,
};

if (typeof window !== 'undefined') {
  (window as any).electronAPI = (global as any).electronAPI;
}

// Minimal `localStorage` polyfill for the Node environment. jsdom
// provides one natively but our node-env tests need it too (the editor
// settings persistence path goes through `window.localStorage`). The
// implementation matches the Web Storage spec surface our code uses
// (`getItem` / `setItem` / `removeItem` / `clear` / `length` / `key`).
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
  (globalThis as { localStorage: Storage }).localStorage = localStorageMock as unknown as Storage;
}
