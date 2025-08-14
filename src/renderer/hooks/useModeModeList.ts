import { ipcBridge } from '@/common';
import useSWR from 'swr';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
const DEFAULT_GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

export const geminiModeList = [
  {
    label: DEFAULT_GEMINI_MODEL,
    value: DEFAULT_GEMINI_MODEL,
  },
  {
    label: DEFAULT_GEMINI_FLASH_MODEL,
    value: DEFAULT_GEMINI_FLASH_MODEL,
  },
  // {
  //   label: DEFAULT_GEMINI_FLASH_LITE_MODEL,
  //   value: DEFAULT_GEMINI_FLASH_LITE_MODEL,
  // },
  // {
  //   label: DEFAULT_GEMINI_EMBEDDING_MODEL,
  //   value: DEFAULT_GEMINI_EMBEDDING_MODEL,
  // },
];

const useModeModeList = (platform: string, base_url?: string, api_key?: string) => {
  return useSWR([platform + '/models', { platform, base_url, api_key }], async ([url, { platform, base_url, api_key }]) => {
    if (platform?.includes('gemini')) {
      return geminiModeList;
    }
    if (!base_url || !api_key) {
      return;
    }
    const res = await ipcBridge.mode.fetchModelList.invoke({ base_url, api_key });
    if (res.success) {
      return res.data?.mode.map((v) => ({
        label: v,
        value: v,
      }));
    }
    return Promise.reject(res.msg);
  });
};

export default useModeModeList;
