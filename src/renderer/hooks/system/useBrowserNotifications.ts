/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { ipcBridge } from '@/common';
import type { INotificationOptions } from '@/common/adapter/ipcBridge';
import { isElectronDesktop } from '@renderer/utils/platform';

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SERVICE_WORKER_READY_TIMEOUT_MS = 500;

function isNotificationSecureContext(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.isSecureContext || LOCALHOST_HOSTS.has(window.location.hostname);
}

function supportsBrowserNotifications(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Notification !== 'undefined' &&
    !isElectronDesktop() &&
    isNotificationSecureContext()
  );
}

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (!supportsBrowserNotifications()) {
    return 'unsupported';
  }

  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  const current = getBrowserNotificationPermission();
  if (current !== 'default') {
    return current;
  }

  return Notification.requestPermission();
}

function getNotificationTargetUrl(conversationId?: string): string {
  if (!conversationId) {
    return window.location.href;
  }

  return `${window.location.origin}${window.location.pathname}#/conversation/${encodeURIComponent(conversationId)}`;
}

function getNotificationIconUrl(): string {
  return new URL('./pwa/icon-192.png', window.location.href).toString();
}

async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    return await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise((resolve) => window.setTimeout(() => resolve(null), SERVICE_WORKER_READY_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

export async function showBrowserNotification(payload: INotificationOptions): Promise<boolean> {
  if (getBrowserNotificationPermission() !== 'granted') {
    return false;
  }

  const targetUrl = getNotificationTargetUrl(payload.conversationId);
  const options: NotificationOptions = {
    body: payload.body,
    data: { url: targetUrl },
    icon: getNotificationIconUrl(),
    tag: payload.conversationId ? `aionui-${payload.conversationId}` : undefined,
  };

  const registration = await getReadyServiceWorkerRegistration();
  if (registration) {
    try {
      await registration.showNotification(payload.title, options);
      return true;
    } catch {
      // Fall through to the page Notification API.
    }
  }

  try {
    const notification = new Notification(payload.title, options);
    notification.onclick = () => {
      window.focus();
      window.location.href = targetUrl;
    };
    return true;
  } catch {
    return false;
  }
}

export function useBrowserNotifications(): void {
  useEffect(() => {
    if (getBrowserNotificationPermission() === 'unsupported') {
      return undefined;
    }

    return ipcBridge.notification.received.on((payload) => {
      void showBrowserNotification(payload);
    });
  }, []);
}
