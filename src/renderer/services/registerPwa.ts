/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isElectronDesktop } from '@renderer/utils/platform';

const SERVICE_WORKER_URL = './sw.js';
const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function isPwaRegistrationSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  if (isElectronDesktop() || !('serviceWorker' in navigator)) {
    return false;
  }

  const { protocol, hostname } = window.location;
  const isHttpOrigin = protocol === 'http:' || protocol === 'https:';
  if (!isHttpOrigin) {
    return false;
  }

  return window.isSecureContext || LOCALHOST_HOSTS.has(hostname);
}

export async function registerPwa(): Promise<ServiceWorkerRegistration | undefined> {
  if (!isPwaRegistrationSupported()) {
    return undefined;
  }

  try {
    return await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: './' });
  } catch (error) {
    console.warn('[PWA] Failed to register service worker:', error);
    return undefined;
  }
}

export default registerPwa;
