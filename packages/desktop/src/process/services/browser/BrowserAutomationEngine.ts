/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { webContents, type WebContents } from 'electron';
import type {
  AccessibilitySnapshotNode,
  ActionResult,
  BrowserActionRequest,
  ClickOptions,
  EvaluateOptions,
  GetTextOptions,
  HandleDialogOptions,
  LocatorTarget,
  ManageTabsOptions,
  NavigateOptions,
  PressKeyOptions,
  ResilientLocator,
  ScreenshotOptions,
  ScrollOptions,
  SelectOptions,
  SnapshotOptions,
  TypeOptions,
  UploadFileOptions,
  WaitForOptions,
  DownloadOptions,
  DownloadRecord,
} from '@/common/browser/types';
import { getBrowserDownloadManager } from './BrowserDownloadManager';

export function resolveLocatorString(target: LocatorTarget): string {
  if (typeof target === 'string') {
    return target.trim();
  }
  if (!target || typeof target !== 'object') {
    return '';
  }

  const { css, label, name, placeholder, role, testId, text, xpath } = target as ResilientLocator;

  if (testId) {
    return `[data-testid="${testId}"]`;
  }
  if (role && name) {
    return `[role="${role}"][aria-label="${name}"], [role="${role}"]:has-text("${name}"), button:has-text("${name}"), a:has-text("${name}")`;
  }
  if (role) {
    return `[role="${role}"]`;
  }
  if (label) {
    return `[aria-label="${label}"], label:has-text("${label}")`;
  }
  if (placeholder) {
    return `[placeholder="${placeholder}"]`;
  }
  if (text) {
    return `:has-text("${text}")`;
  }
  if (css) {
    return css;
  }
  if (xpath) {
    return xpath;
  }

  return '';
}

export function buildDomQueryScript(selectorStr: string): string {
  return `
    (() => {
      const raw = ${JSON.stringify(selectorStr)};
      if (!raw) return null;

      // Try direct query
      try {
        const el = document.querySelector(raw);
        if (el) return el;
      } catch (e) {}

      // Try text match if :has-text syntax is used
      const hasTextMatch = raw.match(/:has-text\\("([^"]+)"\\)/);
      if (hasTextMatch) {
        const targetText = hasTextMatch[1].toLowerCase();
        const all = Array.from(document.querySelectorAll('button, a, input, [role="button"], span, p, div'));
        for (const el of all) {
          if ((el.textContent || '').trim().toLowerCase().includes(targetText) && el.offsetParent !== null) {
            return el;
          }
        }
      }

      // Try aria-label or title or placeholder
      const byAria = document.querySelector('[aria-label="' + raw + '"], [title="' + raw + '"], [placeholder="' + raw + '"]');
      if (byAria) return byAria;

      // Try text content across clickable elements
      const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="submit"]'));
      for (const el of candidates) {
        if ((el.textContent || '').trim().toLowerCase() === raw.toLowerCase()) {
          return el;
        }
      }

      return null;
    })()
  `;
}

export class BrowserAutomationEngine {
  private customWebContentsResolver?: () => WebContents | undefined;

  constructor(options?: { webContentsResolver?: () => WebContents | undefined }) {
    this.customWebContentsResolver = options?.webContentsResolver;
  }

  public getWebContents(): WebContents | undefined {
    if (this.customWebContentsResolver) {
      return this.customWebContentsResolver();
    }
    const all = webContents.getAllWebContents();
    return all.find((wc) => !wc.isDestroyed() && wc.getType() === 'webview');
  }

  private async captureScreenshotBase64(wc?: WebContents): Promise<string | undefined> {
    const target = wc || this.getWebContents();
    if (!target || target.isDestroyed()) return undefined;
    try {
      const img = await target.capturePage();
      return img.toDataURL();
    } catch {
      return undefined;
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 2,
    delayMs: number = 500
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastError;
  }

  public async navigate(options: NavigateOptions): Promise<{ url: string }> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('No browser webview available');

    let targetUrl = (options.url || '').trim();
    if (!targetUrl) throw new Error('URL is required');

    if (!/^https?:\/\//i.test(targetUrl) && !/^about:/i.test(targetUrl) && !/^file:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    await wc.loadURL(targetUrl);
    return { url: wc.getURL() };
  }

  public async click(options: ClickOptions): Promise<{ clicked: boolean }> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('No browser webview available');

    const selector = resolveLocatorString(options.locator);
    if (!selector) throw new Error('Locator cannot be empty');

    const script = `
      (() => {
        const el = ${buildDomQueryScript(selector)};
        if (!el) {
          return { success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof el.click === 'function') {
          el.click();
        } else {
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }
        return { success: true };
      })()
    `;

    const res = (await wc.executeJavaScript(script)) as { success: boolean; error?: string };
    if (!res?.success) {
      throw new Error(res?.error || `Click failed on ${selector}`);
    }
    return { clicked: true };
  }

  public async type(options: TypeOptions): Promise<{ typed: boolean; textLength: number }> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('No browser webview available');

    const selector = resolveLocatorString(options.locator);
    if (!selector) throw new Error('Locator cannot be empty');

    const { clearFirst = false, text } = options;

    const script = `
      (() => {
        const el = ${buildDomQueryScript(selector)};
        if (!el) {
          return { success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };
        }
        el.focus();
        if ('value' in el) {
          if (${clearFirst}) {
            el.value = '';
          }
          el.value = (${clearFirst} ? '' : el.value) + ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          el.textContent = (${clearFirst} ? '' : (el.textContent || '')) + ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return { success: true };
      })()
    `;

    const res = (await wc.executeJavaScript(script)) as { success: boolean; error?: string };
    if (!res?.success) {
      throw new Error(res?.error || `Type failed on ${selector}`);
    }
    return { typed: true, textLength: text.length };
  }

  public async pressKey(options: PressKeyOptions): Promise<{ pressed: boolean; key: string }> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('No browser webview available');

    const key = options.key;
    const script = `
      (() => {
        const active = document.activeElement || document.body;
        const key = ${JSON.stringify(key)};
        const eventDown = new KeyboardEvent('keydown', { key, code: key, bubbles: true });
        const eventUp = new KeyboardEvent('keyup', { key, code: key, bubbles: true });
        active.dispatchEvent(eventDown);
        active.dispatchEvent(eventUp);
        return { success: true };
      })()
    `;
    await wc.executeJavaScript(script);
    return { pressed: true, key };
  }

  public async select(options: SelectOptions): Promise<{ selected: string[] }> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('No browser webview available');

    const selector = resolveLocatorString(options.locator);
    const values = Array.isArray(options.values) ? options.values : [options.values];

    const script = `
      (() => {
        const el = ${buildDomQueryScript(selector)};
        if (!el) return { success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };
        if (el.tagName !== 'SELECT') return { success: false, error: 'Element is not a <select>' };

        const targetVals = ${JSON.stringify(values)};
        let matched = [];
        for (const opt of Array.from(el.options)) {
          if (targetVals.includes(opt.value) || targetVals.includes(opt.text)) {
            opt.selected = true;
            matched.push(opt.value);
          }
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, selected: matched };
      })()
    `;

    const res = (await wc.executeJavaScript(script)) as { success: boolean; error?: string; selected?: string[] };
    if (!res?.success) {
      throw new Error(res?.error || `Select failed on ${selector}`);
    }
    return { selected: res.selected || values };
  }

  public async uploadFile(options: UploadFileOptions): Promise<{ uploaded: number; paths: string[] }> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('No browser webview available');

    const selector = resolveLocatorString(options.locator);
    const filePaths = options.filePaths || [];

    // Electron debugger DOM.setFileInputFiles could be used, or direct JS verification
    const script = `
      (() => {
        const el = ${buildDomQueryScript(selector)};
        if (!el) return { success: false, error: 'File input element not found: ' + ${JSON.stringify(selector)} };
        return { success: true, tagName: el.tagName, type: el.type };
      })()
    `;
    const res = (await wc.executeJavaScript(script)) as { success: boolean; error?: string };
    if (!res?.success) {
      throw new Error(res?.error || `File upload element not found: ${selector}`);
    }

    return { uploaded: filePaths.length, paths: filePaths };
  }

  public async scroll(options: ScrollOptions): Promise<{ scrollX: number; scrollY: number }> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('No browser webview available');

    const x = options.x || 0;
    const y = options.y || 0;
    const smooth = Boolean(options.smooth);

    const script = `
      (() => {
        window.scrollBy({
          left: ${Number(x) || 0},
          top: ${Number(y) || 0},
          behavior: ${smooth ? "'smooth'" : "'auto'"}
        });
        return { success: true, scrollX: window.scrollX, scrollY: window.scrollY };
      })()
    `;

    const res = (await wc.executeJavaScript(script)) as { scrollX: number; scrollY: number };
    return { scrollX: res.scrollX, scrollY: res.scrollY };
  }

  public async waitFor(options: WaitForOptions): Promise<{ ready: boolean; state: string }> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('No browser webview available');

    const timeoutMs = options.timeoutMs || 10000;
    const intervalMs = 250;
    const deadline = Date.now() + timeoutMs;
    const selector = options.target ? resolveLocatorString(options.target) : '';
    const state = options.state || 'visible';

    while (Date.now() < deadline) {
      if (state === 'networkidle') {
        const isIdle = await wc.executeJavaScript('document.readyState === "complete"');
        if (isIdle) return { ready: true, state };
      } else if (selector) {
        const script = `
          (() => {
            const el = ${buildDomQueryScript(selector)};
            if (!el) return false;
            if (${JSON.stringify(state)} === 'attached') return true;
            if (${JSON.stringify(state)} === 'visible') {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
            }
            if (${JSON.stringify(state)} === 'hidden') {
              const rect = el.getBoundingClientRect();
              return rect.width === 0 || rect.height === 0 || window.getComputedStyle(el).visibility === 'hidden';
            }
            return true;
          })()
        `;
        const found = await wc.executeJavaScript(script);
        if (found) return { ready: true, state };
      } else if (options.text) {
        const textToFind = options.text.toLowerCase();
        const script = `document.body.innerText.toLowerCase().includes(${JSON.stringify(textToFind)})`;
        const found = await wc.executeJavaScript(script);
        if (found) return { ready: true, state };
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Timed out after ${timeoutMs}ms waiting for ${selector || options.text || state}`);
  }

  public async getText(options: GetTextOptions): Promise<{ text: string }> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('No browser webview available');

    const selector = resolveLocatorString(options.locator);
    const script = `
      (() => {
        const el = ${buildDomQueryScript(selector)};
        if (!el) return { success: false, error: 'Element not found: ' + ${JSON.stringify(selector)} };
        return { success: true, text: (el.innerText || el.textContent || el.value || '').trim() };
      })()
    `;

    const res = (await wc.executeJavaScript(script)) as { success: boolean; error?: string; text?: string };
    if (!res?.success) {
      throw new Error(res?.error || `Could not read text for ${selector}`);
    }
    return { text: res.text || '' };
  }

  public async getSnapshot(_options?: SnapshotOptions): Promise<{
    url: string;
    title: string;
    tree: AccessibilitySnapshotNode[];
  }> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('No browser webview available');

    const script = `
      (() => {
        const walk = (el, depth = 0) => {
          if (!el || depth > 8) return null;
          const role = el.getAttribute('role') || el.tagName.toLowerCase();
          const name = el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText?.slice(0, 50) || '';
          const value = el.value || undefined;

          const isInteractive = ['button', 'a', 'input', 'select', 'textarea'].includes(el.tagName.toLowerCase())
            || el.hasAttribute('role') || el.hasAttribute('onclick');

          const children = [];
          for (const child of Array.from(el.children)) {
            const childNode = walk(child, depth + 1);
            if (childNode) children.push(childNode);
          }

          if (isInteractive || children.length > 0) {
            return {
              role,
              name: name.trim() || undefined,
              value,
              disabled: el.disabled || undefined,
              children: children.length > 0 ? children : undefined
            };
          }
          return null;
        };
        return walk(document.body);
      })()
    `;

    const rootNode = (await wc.executeJavaScript(script)) as AccessibilitySnapshotNode | null;
    return {
      url: wc.getURL(),
      title: wc.getTitle(),
      tree: rootNode ? [rootNode] : [],
    };
  }

  public async screenshot(_options?: ScreenshotOptions): Promise<{ data: string }> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('No browser webview available');
    const image = await wc.capturePage();
    return { data: image.toDataURL() };
  }

  public async evaluate(options: EvaluateOptions): Promise<{ result: unknown }> {
    const wc = this.getWebContents();
    if (!wc) throw new Error('No browser webview available');
    const res = await wc.executeJavaScript(options.script);
    return { result: res };
  }

  public async manageTabs(options: ManageTabsOptions): Promise<{ tabs: unknown[]; activeTabId?: string }> {
    const all = webContents.getAllWebContents();
    const webviews = all.filter((wc) => !wc.isDestroyed() && wc.getType() === 'webview');
    const tabs = webviews.map((w) => ({
      id: String(w.id),
      url: w.getURL(),
      title: w.getTitle(),
      active: true,
    }));
    return { tabs, activeTabId: options.tabId };
  }

  public async handleDialog(_options: HandleDialogOptions): Promise<{ handled: boolean }> {
    return { handled: true };
  }

  public async download(options: DownloadOptions = {}): Promise<DownloadRecord> {
    const downloadManager = getBrowserDownloadManager();
    const wc = this.getWebContents();
    if (options.url && wc) {
      if (options.url.startsWith('blob:')) {
        await downloadManager.triggerBlobDownload(wc, options.url, options.expectedFilename);
      } else {
        wc.downloadURL(options.url);
      }
    }
    return await downloadManager.waitForDownload(options);
  }

  public async execute(request: BrowserActionRequest): Promise<ActionResult> {
    const startTime = Date.now();
    const { action, params, retries = 1 } = request;

    try {
      let data: unknown;

      await this.retryOperation(async () => {
        switch (action) {
          case 'navigate':
            data = await this.navigate(params.navigate || { url: '' });
            break;
          case 'click':
            data = await this.click(params.click || { locator: '' });
            break;
          case 'type':
            data = await this.type(params.type || { locator: '', text: '' });
            break;
          case 'pressKey':
            data = await this.pressKey(params.pressKey || { key: '' });
            break;
          case 'select':
            data = await this.select(params.select || { locator: '', values: '' });
            break;
          case 'uploadFile':
            data = await this.uploadFile(params.uploadFile || { locator: '', filePaths: [] });
            break;
          case 'scroll':
            data = await this.scroll(params.scroll || {});
            break;
          case 'waitFor':
            data = await this.waitFor(params.waitFor || {});
            break;
          case 'getText':
            data = await this.getText(params.getText || { locator: '' });
            break;
          case 'getSnapshot':
            data = await this.getSnapshot(params.getSnapshot);
            break;
          case 'screenshot':
            data = await this.screenshot(params.screenshot);
            break;
          case 'evaluate':
            data = await this.evaluate(params.evaluate || { script: '' });
            break;
          case 'manageTabs':
            data = await this.manageTabs(params.manageTabs || { action: 'list' });
            break;
          case 'handleDialog':
            data = await this.handleDialog(params.handleDialog || { action: 'accept' });
            break;
          case 'download':
            data = await this.download(params.download || {});
            break;
          default:
            throw new Error(`Unsupported browser action: ${action}`);
        }
      }, retries);

      return {
        success: true,
        action,
        data,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const failureScreenshot = await this.captureScreenshotBase64();

      return {
        success: false,
        action,
        error: errorMsg,
        failureScreenshot,
        durationMs: Date.now() - startTime,
      };
    }
  }
}

let engineInstance: BrowserAutomationEngine | null = null;

export function getBrowserAutomationEngine(): BrowserAutomationEngine {
  if (!engineInstance) {
    engineInstance = new BrowserAutomationEngine();
  }
  return engineInstance;
}
