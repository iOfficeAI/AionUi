/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import { ConfigStorage } from '../../common/storage';

export type MainLocale = 'en-US' | 'zh-CN' | 'zh-TW' | 'ja-JP' | 'ko-KR';

type DictKey = 'tray.openWebUi' | 'tray.openMain' | 'tray.quit' | 'tray.tooltip' | 'webui.dialog.title' | 'webui.dialog.portInUse' | 'webui.dialog.startFailed' | 'webui.dialog.portInUseHint';

const dict: Record<MainLocale, Record<DictKey, string>> = {
  'en-US': {
    'tray.openWebUi': 'Open WebUI',
    'tray.openMain': 'Open AionUi',
    'tray.quit': 'Quit',
    'tray.tooltip': 'AionUi',
    'webui.dialog.title': 'WebUI',
    'webui.dialog.portInUse': 'WebUI port {{port}} is already in use.',
    'webui.dialog.portInUseHint': 'Please change the port in webui.config.json or environment variables.',
    'webui.dialog.startFailed': 'Failed to start WebUI.',
  },
  'zh-CN': {
    'tray.openWebUi': '打开 WebUI',
    'tray.openMain': '打开主界面',
    'tray.quit': '退出',
    'tray.tooltip': 'AionUi',
    'webui.dialog.title': 'WebUI',
    'webui.dialog.portInUse': 'WebUI 端口 {{port}} 已被占用。',
    'webui.dialog.portInUseHint': '请在 webui.config.json 或环境变量中修改端口后重试。',
    'webui.dialog.startFailed': '启动 WebUI 失败。',
  },
  'zh-TW': {
    'tray.openWebUi': '開啟 WebUI',
    'tray.openMain': '開啟主介面',
    'tray.quit': '結束',
    'tray.tooltip': 'AionUi',
    'webui.dialog.title': 'WebUI',
    'webui.dialog.portInUse': 'WebUI 連接埠 {{port}} 已被占用。',
    'webui.dialog.portInUseHint': '請在 webui.config.json 或環境變數中修改連接埠後重試。',
    'webui.dialog.startFailed': '啟動 WebUI 失敗。',
  },
  'ja-JP': {
    'tray.openWebUi': 'WebUI を開く',
    'tray.openMain': 'AionUi を開く',
    'tray.quit': '終了',
    'tray.tooltip': 'AionUi',
    'webui.dialog.title': 'WebUI',
    'webui.dialog.portInUse': 'WebUI ポート {{port}} は既に使用されています。',
    'webui.dialog.portInUseHint': 'webui.config.json または環境変数でポートを変更してから再試行してください。',
    'webui.dialog.startFailed': 'WebUI の起動に失敗しました。',
  },
  'ko-KR': {
    'tray.openWebUi': 'WebUI 열기',
    'tray.openMain': 'AionUi 열기',
    'tray.quit': '종료',
    'tray.tooltip': 'AionUi',
    'webui.dialog.title': 'WebUI',
    'webui.dialog.portInUse': 'WebUI 포트 {{port}}가 이미 사용 중입니다.',
    'webui.dialog.portInUseHint': 'webui.config.json 또는 환경 변수에서 포트를 변경한 후 다시 시도하세요.',
    'webui.dialog.startFailed': 'WebUI 시작에 실패했습니다.',
  },
};

const normalizeLocale = (raw?: string | null): MainLocale => {
  const value = (raw || '').trim();
  if (value === 'zh-CN') return 'zh-CN';
  if (value === 'zh-TW') return 'zh-TW';
  if (value === 'ja-JP') return 'ja-JP';
  if (value === 'ko-KR') return 'ko-KR';

  // Accept common browser / OS locale variants.
  if (value.toLowerCase().startsWith('zh')) {
    // Heuristic: zh-TW/HK/MO -> zh-TW; default zh-CN.
    if (/zh-(tw|hk|mo)/i.test(value)) return 'zh-TW';
    return 'zh-CN';
  }

  if (value.toLowerCase().startsWith('ja')) return 'ja-JP';
  if (value.toLowerCase().startsWith('ko')) return 'ko-KR';
  return 'en-US';
};

export const getSystemMainLocale = (): MainLocale => {
  return normalizeLocale(app.getLocale());
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
  return await new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
};

export const loadMainLocale = async (timeoutMs = 200): Promise<MainLocale> => {
  try {
    // Avoid blocking app startup if storage gets stuck.
    const stored = await withTimeout(ConfigStorage.get('language'), timeoutMs);
    if (stored) return normalizeLocale(stored);
  } catch {
    // ignore
  }
  return getSystemMainLocale();
};

export const tMain = (locale: MainLocale, key: DictKey, vars?: Record<string, string | number>): string => {
  const template = dict[locale]?.[key] ?? dict['en-US'][key];
  if (!vars) return template;
  return Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(String(v)), template);
};
