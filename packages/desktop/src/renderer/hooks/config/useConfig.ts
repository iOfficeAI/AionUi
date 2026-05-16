import { useCallback, useSyncExternalStore } from 'react';
import type { ConfigKey, ConfigKeyMap } from '@/common/config/configKeys';
import { configService } from '@/common/config/configService';

export function useConfig<K extends ConfigKey>(
  key: K
): [ConfigKeyMap[K] | undefined, (value: ConfigKeyMap[K]) => Promise<void>] {
  const value = useSyncExternalStore(
    (onStoreChange) => configService.subscribe(key, onStoreChange),
    () => configService.get(key)
  );

  const setValue = useCallback((newValue: ConfigKeyMap[K]) => configService.set(key, newValue), [key]);

  return [value, setValue];
}
