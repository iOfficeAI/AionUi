/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from 'react';
import { Button, Input, Message, Space } from '@arco-design/web-react';
import WebviewHost from '@/renderer/components/media/WebviewHost';
import { BROWSER_SESSION_PARTITION } from '@/common/config/constants';
const DEMO_PARTITION = 'persist:aionui-dev-browser-demo';

/**
 * 临时测试页：复用项目内的 <WebviewHost> 在桌面应用里打开任意外部 URL。
 *
 * 用法：
 *   1. 启动应用并登录后，导航到 /test/browser-demo
 *   2. 在地址栏输入或点击下方按钮，target 会跳到那个 URL
 *   3. 复用应用内浏览器 partition，重启后登录态保留
 *
 * 故意放在 _dev/ 下并配 /test/* 路由，避开登录校验外的访问路径。
 *
 * 这是 demo/临时页，不要替换正式浏览器 tab 系统。
 */
const TARGET_URL = 'http://pm.badousoft.com/center/';

const InAppBrowserDemo: React.FC = () => {
  const [message, contextHolder] = Message.useMessage();
  const [url, setUrl] = useState<string>(TARGET_URL);
  const [draft, setDraft] = useState<string>(TARGET_URL);

  const handleNavigate = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      message.warning('地址不能为空');
      return;
    }
    const next = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    setUrl(next);
    message.info(`跳转到 ${next}`);
  }, [draft, message]);

  const handleOpenTarget = useCallback(() => {
    setDraft(TARGET_URL);
    setUrl(TARGET_URL);
    message.success(`已跳转到目标: ${TARGET_URL}`);
  }, [message]);

  const handleReload = useCallback(() => {
    // 通过给 url 追加一个无害的查询串强制 webview 重载，规避 webview 自身 reload() 在 React 树外引用
    setUrl((prev) => {
      const sep = prev.includes('?') ? '&' : '?';
      return `${prev}${sep}_=${Date.now()}`;
    });
  }, []);

  return (
    <div className='h-full flex flex-col'>
      {contextHolder}
      <div className='flex-shrink-0 p-4 border-b border-border-1 bg-bg-2 space-y-3'>
        <div className='flex items-center justify-between'>
          <h1 className='text-xl font-semibold m-0'>应用内浏览器 Demo</h1>
          <Space>
            <Button onClick={handleReload}>重载</Button>
            <Button type='primary' onClick={handleOpenTarget}>
              一键跳到 pm.badousoft.com/center
            </Button>
          </Space>
        </div>
        <Space>
          <Input
            placeholder='输入 URL，例如 http://pm.badousoft.com/center/'
            value={draft}
            onChange={(v) => setDraft(v)}
            onPressEnter={handleNavigate}
            style={{ width: 480 }}
            allowClear
          />
          <Button onClick={handleNavigate} type='secondary'>
            跳转
          </Button>
        </Space>
        <p className='text-t-secondary text-xs m-0'>
          当前 target: <code>{url}</code> · partition: <code>{BROWSER_SESSION_PARTITION}</code>
        </p>
      </div>

      <div className='flex-1 min-h-0'>
        <WebviewHost
          url={url}
          partition={DEMO_PARTITION}
          showNavBar
          className='bg-bg-1'
          onUrlChange={(next) => setUrl(next)}
          onDidFailLoad={(code, desc) => message.error(`加载失败 ${code}: ${desc}`)}
        />
      </div>
    </div>
  );
};

export default InAppBrowserDemo;
