/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

//子进程实例
/**
 * 提供进程启动
 * 提供主/子进程间通信功能
 */

import { uuid } from '@/renderer/utils/common';
import { getPlatformServices } from '@/common/platform';
import type { IWorkerProcess } from '@/common/platform';
import { getEnhancedEnv } from '@process/utils/shellEnv';
import type { MainToWorkerMessage } from '../WorkerProtocol';
import { Pipe } from './pipe';

export class ForkTask<Data> extends Pipe {
  protected path = '';
  protected data: Data;
  protected fcp: IWorkerProcess | undefined;
  private killFn: () => void;
  private enableFork: boolean;
  constructor(path: string, data: Data, enableFork = true) {
    super(true);
    this.path = path;
    this.data = data;
    this.enableFork = enableFork;
    this.killFn = () => {
      this.kill();
    };
    process.on('exit', this.killFn);
    if (this.enableFork) this.init();
  }
  kill() {
    if (this.fcp) {
      this.fcp.kill();
    }
    process.off('exit', this.killFn);
  }
  protected init() {
    const platform = getPlatformServices();
    // In packaged Electron builds, resolve to app.asar.unpacked for WASM files.
    const workerCwd = platform.paths.isPackaged()
      ? (platform.paths.getAppPath() ?? process.cwd()).replace('app.asar', 'app.asar.unpacked')
      : process.cwd();
    // Pass enhanced shell environment so workers inherit the full PATH (nvm, npm globals, etc.)
    // This is critical for skills that depend on globally installed tools (node, npm, playwright, etc.)
    // Without this, workers only get Electron's limited env, missing paths set in .zshrc/.bashrc
    const workerEnv = getEnhancedEnv();
    const fcp = platform.worker.fork(this.path, [], {
      cwd: workerCwd,
      env: workerEnv,
    });
    // 接受子进程发送的消息
    fcp.on('message', (...args: unknown[]) => {
      const e = args[0] as IForkData;
      if (e.type === 'complete') {
        fcp.kill();
        this.emit('complete', e.data);
      } else if (e.type === 'error') {
        fcp.kill();
        this.emit('error', e.data);
      } else {
        // clientId约束为主/子进程间通信钥匙
        // 如果有clientId则向指定通道发起信息
        const deferred = this.deferred(e.pipeId);
        if (e.pipeId) {
          // 如果存在回调，则将回调信息发送到子进程
          Promise.resolve(deferred.pipe(this.postMessage.bind(this))).catch((error) => {
            console.error('Failed to pipe message:', error);
          });
        }
        return this.emit(e.type, e.data, deferred);
      }
    });
    fcp.on('error', (...args: unknown[]) => {
      this.emit('error', args[0] as Error);
    });
    this.fcp = fcp;
  }
  start() {
    if (!this.enableFork) return Promise.resolve();
    const { data } = this;
    return this.postMessagePromise('start', data);
  }
  // 向子进程发送消息并等待回调
  protected postMessagePromise(type: string, data: any) {
    return new Promise<any>((resolve, reject) => {
      const pipeId = uuid(8);
      // console.log("---------发送消息>", this.callbackKey(pipeId), type, data);
      this.once(this.callbackKey(pipeId), (data) => {
        // console.log("---------子进程消息加调监听>", data);
        if (data.state === 'fulfilled') {
          resolve(data.data);
        } else {
          reject(data.data);
        }
      });
      this.postMessage(type, data, { pipeId });
    });
  }
  // 向子进程发送回调
  postMessage(type: MainToWorkerMessage['type'] | string, data: unknown, extPrams: Record<string, unknown> = {}) {
    if (!this.fcp) throw new Error('fork task not enabled');
    this.fcp.postMessage({ type, data, ...extPrams });
  }
}

interface IForkData {
  type: 'complete' | 'error' | string;
  data: any;
  pipeId?: string;
  [key: string]: any;
}
