/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GeaClientError, type ClientVersion, type GeaClientAdapter } from '@/common/adapter/geaClient';
import type { GeaLarkAuthService } from '@aionui/web-host';

/** One Main-owned loop per installation, independent of renderer windows. */
export class ClientPresenceService {
  private abort?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private installationId?: string;
  private retrySeconds = 30;

  constructor(
    private readonly filePath: string,
    private readonly adapter: GeaClientAdapter,
    private readonly version: ClientVersion,
    private readonly auth: Pick<GeaLarkAuthService, 'forwardGatewayAuthSession'>,
    private readonly onAuthRequired: () => Promise<void>
  ) {}

  async start(): Promise<void> {
    if (this.abort) return;
    const controller = new AbortController();
    this.abort = controller;
    try {
      this.installationId ??= await this.loadInstallationId();
      if (!controller.signal.aborted) await this.tick(controller);
    } catch {
      if (this.abort === controller) this.stop();
    }
  }

  stop(): void {
    this.abort?.abort();
    this.abort = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async tick(controller: AbortController): Promise<void> {
    if (controller.signal.aborted) return;
    let seconds = this.retrySeconds;
    try {
      const authenticated = await this.auth.forwardGatewayAuthSession(async (credential) => {
        if (!controller.signal.aborted)
          seconds = await this.adapter.heartbeat(this.version, this.installationId!, credential, controller.signal);
      });
      if (!authenticated) {
        if (this.abort === controller) this.stop();
        return;
      }
      this.retrySeconds = 30;
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof GeaClientError && error.code === 'CLIENT_AUTH_REQUIRED') {
        this.stop();
        await this.onAuthRequired().catch(() => {});
        return;
      }
      if (
        error instanceof GeaClientError &&
        (error.code === 'CLIENT_RESPONSE_INVALID' ||
          error.code === 'CLIENT_REQUEST_INVALID' ||
          error.code === 'CLIENT_STATE_INVALID')
      ) {
        this.stop();
        return;
      }
      this.retrySeconds = Math.min(this.retrySeconds * 2, 300);
    }
    if (!controller.signal.aborted)
      this.timer = setTimeout(() => {
        void this.tick(controller);
      }, seconds * 1000);
  }

  private async loadInstallationId(): Promise<string> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await writeFile(this.filePath, randomUUID(), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const value = (await readFile(this.filePath, 'utf8')).trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
      throw new GeaClientError('CLIENT_DEVICE_ID_INVALID');
    return value;
  }
}
