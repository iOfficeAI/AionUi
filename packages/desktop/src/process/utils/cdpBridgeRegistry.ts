/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 单目标 CDP 通道句柄的存放处。
 *
 * 单独一个小模块，是为了避开循环依赖：通道在 index.ts 里启动，而使用它的是
 * applicationBridge.ts，后者又是被 index.ts 间接引入的。让两边都只依赖这个中立模块，
 * 就不必让 bridge 反向 import 入口文件。
 *
 * Holds the single-target CDP bridge handle. It lives in its own tiny module to avoid a
 * cycle: the bridge is started in index.ts but consumed by applicationBridge.ts, which
 * index.ts itself pulls in. Having both depend on this neutral module means the bridge
 * layer never has to import the entry file.
 */

import type { CdpBridgeHandle } from '../resources/builtinMcp/cdpBridge';

let handle: CdpBridgeHandle | null = null;

export const setCdpBridgeHandle = (next: CdpBridgeHandle | null): void => {
  handle = next;
};

export const getCdpBridgeHandle = (): CdpBridgeHandle | null => handle;
