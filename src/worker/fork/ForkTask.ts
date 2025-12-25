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
import type { UtilityProcess } from 'electron';
import { app, utilityProcess } from 'electron';
import { Pipe } from './pipe';

/**
 * 获取 worker 进程的工作目录
 * Get working directory for worker process
 *
 * 在打包环境中，需要指向 app.asar.unpacked 目录以便 aioncli-core 能找到 WASM 文件
 * In packaged environment, needs to point to app.asar.unpacked directory
 * so aioncli-core can find WASM files
 */
function getWorkerCwd(): string {
  if (app.isPackaged) {
    // 打包环境: app.getAppPath() 返回 .../Resources/app.asar
    // 我们需要 .../Resources/app.asar.unpacked 目录
    // Packaged: app.getAppPath() returns .../Resources/app.asar
    // We need the .../Resources/app.asar.unpacked directory
    const appPath = app.getAppPath();
    return appPath.replace('app.asar', 'app.asar.unpacked');
  }
  // 开发环境: 使用项目根目录
  // Development: use project root directory
  return process.cwd();
}

export class ForkTask<Data> extends Pipe {
  protected path = '';
  protected data: Data;
  protected fcp: UtilityProcess | undefined;
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
    // 传递 cwd 确保 worker 可以正确解析 node_modules 路径 (用于加载 WASM 文件等)
    // Pass cwd to ensure worker can correctly resolve node_modules paths (for WASM files etc.)
    const workerCwd = getWorkerCwd();
    const fcp = utilityProcess.fork(this.path, [], {
      cwd: workerCwd,
    });
    // 接受子进程发送的消息
    fcp.on('message', (e: IForkData) => {
      // console.log("---------接受来子进程消息>", e);
      // 接爱子进程消息
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
    fcp.on('error', (err) => {
      this.emit('error', err);
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
  postMessage(type: string, data: any, extPrams: Record<string, any> = {}) {
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
