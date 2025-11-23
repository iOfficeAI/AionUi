/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// 集中管理 renderer 端的运行时补丁，使入口文件保持整洁
// Centralize renderer runtime patches so the entry file stays tidy

declare global {
  interface Window {
    __AionSafeResizeObserver__?: boolean;
    __AionResizeObserverPatched__?: boolean;
  }

  interface Console {
    __AionResizeObserverPatched__?: boolean;
  }
}

const RESIZE_OBSERVER_PATTERNS = ['resizeobserver loop limit exceeded', 'resizeobserver loop completed with undelivered notifications'];

// Silence Arco Design Message component key warnings (internal library issue)
// 抑制 Arco Design Message 组件的 key 警告（第三方库内部问题）
const ARCO_MESSAGE_KEY_PATTERNS = ['each child in a list should have a unique "key" prop', 'check the render method of `layout`', 'check the render method of `message`'];

// Silence React 19 ref deprecation warnings from third-party libraries
// 抑制第三方库中 React 19 ref 废弃警告（等待库更新）
const REACT_19_REF_PATTERNS = ['accessing element.ref was removed in react 19', 'ref is now a regular prop'];

const extractMessage = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (typeof value === 'object' && 'message' in value && typeof (value as any).message === 'string') {
    return (value as { message: string }).message;
  }
  return undefined;
};

const shouldSilence = (message?: string) => {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return RESIZE_OBSERVER_PATTERNS.some((pattern) => normalized.includes(pattern)) || ARCO_MESSAGE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern)) || REACT_19_REF_PATTERNS.some((pattern) => normalized.includes(pattern));
};

const patchGlobalErrorListeners = () => {
  const nativeAdd = window.addEventListener.bind(window);
  const nativeRemove = window.removeEventListener.bind(window);
  const listenerMap = new WeakMap<EventListenerOrEventListenerObject, EventListenerOrEventListenerObject>();

  // Hook the top-level error listeners so we can filter ResizeObserver noise before
  // Webpack/Arco overlays run (避免在 overlay 触发前就被 ResizeObserver 循环警告刷屏，同时保留真实报错).
  window.addEventListener = ((type: any, listener: any, options: any) => {
    if ((type === 'error' || type === 'unhandledrejection') && listener) {
      const wrapped: EventListenerOrEventListenerObject = (event: any) => {
        const message = type === 'error' ? (extractMessage(event.error) ?? event.message) : extractMessage(event.reason);
        if (shouldSilence(message)) {
          event.preventDefault?.();
          event.stopImmediatePropagation?.();
          return;
        }
        if (typeof listener === 'function') {
          return listener(event);
        }
        return listener.handleEvent?.(event);
      };
      listenerMap.set(listener, wrapped);
      return nativeAdd(type, wrapped, options);
    }
    return nativeAdd(type, listener, options);
  }) as typeof window.addEventListener;

  window.removeEventListener = ((type: any, listener: any, options: any) => {
    if ((type === 'error' || type === 'unhandledrejection') && listenerMap.has(listener)) {
      const wrapped = listenerMap.get(listener) as EventListenerOrEventListenerObject;
      listenerMap.delete(listener);
      return nativeRemove(type, wrapped, options);
    }
    return nativeRemove(type, listener, options);
  }) as typeof window.removeEventListener;
};

const patchResizeObserver = () => {
  // Wrap ResizeObserver callbacks in requestAnimationFrame to break the feedback loop that
  // browsers treat as "ResizeObserver loop" (在下一帧执行回调，可彻底规避 ResizeObserver loop limit 警告).
  if (!window.__AionSafeResizeObserver__ && typeof ResizeObserver !== 'undefined') {
    const NativeResizeObserver = window.ResizeObserver;
    class SafeResizeObserver extends NativeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        let frame = 0;
        super((entries, observer) => {
          if (frame) cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            frame = 0;
            try {
              callback(entries, observer);
            } catch (error) {
              if (!shouldSilence(extractMessage(error))) {
                throw error;
              }
            }
          });
        });
      }
    }
    window.ResizeObserver = SafeResizeObserver as typeof ResizeObserver;
    window.__AionSafeResizeObserver__ = true;
  }
};

const patchGlobalErrorFilters = () => {
  // Global error/rejection filter: quietly drop known RO-loop messages but keep other errors
  // (全局过滤 ResizeObserver 循环提示，只忽略白名单消息，其余错误依然向外抛出).
  if (!window.__AionResizeObserverPatched__) {
    const errorHandler = (event: ErrorEvent) => {
      if (shouldSilence(extractMessage(event.error) ?? event.message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      if (shouldSilence(extractMessage(event.reason))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('error', errorHandler, true);
    window.addEventListener('unhandledrejection', rejectionHandler, true);
    window.__AionResizeObserverPatched__ = true;
  }
};

const patchConsole = () => {
  // Console patch mirrors the listener filters so devtools logs stay clean（控制台同样做拦截，防止被重复警告淹没）.
  if (typeof console !== 'undefined' && !console.__AionResizeObserverPatched__) {
    const rawError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      if (args.some((arg) => shouldSilence(extractMessage(arg)))) {
        return;
      }
      rawError(...args);
    };
    console.__AionResizeObserverPatched__ = true;
  }
};

const patchDevServerOverlay = () => {
  const devClient = (window as any).__webpack_dev_server_client__ || ((window as any).__webpack_dev_server_client__ = {});
  devClient.overlay = {
    show: () => {},
    hide: () => {},
  };
};

export const applyRuntimePatches = () => {
  if (typeof window === 'undefined') {
    return;
  }
  patchGlobalErrorListeners();
  patchResizeObserver();
  patchGlobalErrorFilters();
  patchConsole();
  patchDevServerOverlay();
};

applyRuntimePatches();
