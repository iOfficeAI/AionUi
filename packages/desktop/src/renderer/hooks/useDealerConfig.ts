import { useCallback, useEffect, useState } from 'react';
import { ipcBridge } from '@/common';

interface DealerConfig {
  ref: string;
}

const REGISTER_BASE_URL = 'https://api.mxou.cn/register';

const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.electronAPI);

export function useDealerConfig(): {
  dealerConfig: DealerConfig | null;
  loading: boolean;
  openRegisterUrl: () => Promise<void>;
} {
  const [dealerConfig, setDealerConfig] = useState<DealerConfig | null>(null);
  const [loading, setLoading] = useState(isDesktopRuntime);

  useEffect(() => {
    if (!isDesktopRuntime) {
      setLoading(false);
      return;
    }
    ipcBridge.application.getDealerConfig
      .invoke()
      .then((result) => {
        if (result.success && result.data) {
          setDealerConfig(result.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openRegisterUrl = useCallback(async () => {
    const ref = dealerConfig?.ref;
    const url = ref ? `${REGISTER_BASE_URL}?ref=${encodeURIComponent(ref)}` : REGISTER_BASE_URL;
    await ipcBridge.shell.openExternal.invoke(url);
  }, [dealerConfig]);

  return { dealerConfig, loading, openRegisterUrl };
}
