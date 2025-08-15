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

import { uuid } from "@/renderer/utils/common";
import { Pipe } from "./pipe";
import type { UtilityProcess} from "electron";
import { utilityProcess } from "electron";

export class ForkTask<Data> extends Pipe {
  protected path = "";
  protected data: Data;
  protected fcp: UtilityProcess;
  private killFn: () => void;
  constructor(path: string, data: Data) {
    super(true);
    this.path = path;
    this.data = data;
    this.killFn = () => {
      this.kill();
    };
    process.on("exit", this.killFn);
    this.init();
  }
  kill() {
    if (this.fcp) {
      this.fcp.kill();
    }
    process.off("exit", this.killFn);
  }
  protected init() {
    const fcp = utilityProcess.fork(this.path);
    // 接受子进程发送的消息
    fcp.on("message", (e: IForkData) => {
      // console.log("---------接受来子进程消息>", e);
      // 接爱子进程消息
      if (e.type === "complete") {
        fcp.kill();
        this.emit("complete", e.data);
      } else if (e.type === "error") {
        fcp.kill();
        this.emit("error", e.data);
      } else {
        // clientId约束为主/子进程间通信钥匙
        // 如果有clientId则向指定通道发起信息
        const deferred = this.deferred(e.pipeId);
        if (e.pipeId) {
          // 如果存在回调，则将回调信息发送到子进程
          deferred.pipe(this.postMessage.bind(this));
        }
        return this.emit(e.type, e.data, deferred);
      }
    });
    fcp.on("error", (err) => {
      this.emit("error", err);
    });
    this.fcp = fcp;
  }
  start() {
    const { data } = this;
    return this.postMessagePromise("start", data);
  }
  // 向子进程发送消息并等待回调
  postMessagePromise(type: string, data: any) {
    return new Promise<any>((resolve, reject) => {
      const pipeId = uuid(8);
      // console.log("---------发送消息>", this.callbackKey(pipeId), type, data);
      this.once(this.callbackKey(pipeId), (data) => {
        // console.log("---------子进程消息加调监听>", data);
        if (data.state === "fulfilled") {
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
    this.fcp.postMessage({ type, data, ...extPrams });
  }
}

interface IForkData {
  type: "complete" | "error" | string;
  data: any;
  pipeId?: string;
  [key: string]: any;
}
