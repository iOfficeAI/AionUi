/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge } from '@office-ai/platform';
import React, { useCallback, useEffect, useState } from 'react';
import { SHOW_OPEN_REQUEST_EVENT } from '../../adapter/constant';
import DirectorySelectionModal from '../components/DirectorySelectionModal';

interface DirectorySelectionRequest {
  id: string;
  isFileMode?: boolean;
  properties?: string[];
}

export const useDirectorySelection = () => {
  const [visible, setVisible] = useState(false);
  const [requestData, setRequestData] = useState<DirectorySelectionRequest | null>(null);

  const handleConfirm = useCallback(
    (paths: string[] | undefined) => {
      if (requestData) {
        // Bridge 框架的回调事件命名规则: subscribe.callback-{event-name}{id}
        const callbackEventName = `subscribe.callback-show-open${requestData.id}`;
        // 使用全局函数发送回调到 bridge emitter
        if ((window as any).__emitBridgeCallback) {
          (window as any).__emitBridgeCallback(callbackEventName, paths);
        }
      }
      setVisible(false);
      setRequestData(null);
    },
    [requestData]
  );

  const handleCancel = useCallback(() => {
    if (requestData) {
      // Bridge 框架的回调事件命名规则: subscribe.callback-{event-name}{id}
      const callbackEventName = `subscribe.callback-show-open${requestData.id}`;
      // 使用全局函数发送回调到 bridge emitter
      if ((window as any).__emitBridgeCallback) {
        (window as any).__emitBridgeCallback(callbackEventName, undefined);
      }
    }
    setVisible(false);
    setRequestData(null);
  }, [requestData]);

  useEffect(() => {
    const handleShowOpenRequest = (data: DirectorySelectionRequest) => {
      // 判断是文件选择还是目录选择
      let isFileMode = data.isFileMode === true;

      // 从 properties 自动推断
      if (!isFileMode && data.properties) {
        isFileMode = data.properties.includes('openFile') && !data.properties.includes('openDirectory');
      }

      setRequestData({ ...data, isFileMode });
      setVisible(true);
    };

    // 监听来自 browser.ts 的文件选择请求
    bridge.on(SHOW_OPEN_REQUEST_EVENT, handleShowOpenRequest);

    return () => {
      bridge.off(SHOW_OPEN_REQUEST_EVENT, handleShowOpenRequest);
    };
  }, []);

  const contextHolder = <DirectorySelectionModal visible={visible} isFileMode={requestData?.isFileMode} onConfirm={handleConfirm} onCancel={handleCancel} />;

  return { contextHolder };
};
