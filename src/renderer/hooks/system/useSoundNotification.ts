import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import { soundNotificationService, type SoundPreset } from '@renderer/services/sound/SoundNotificationService';
import { useEffect } from 'react';

export function useSoundNotification(): void {
  useEffect(() => {
    const unsubscribe = ipcBridge.conversation.turnCompleted.on(async (event) => {
      if (event.state !== 'ai_waiting_input') return;

      const [enabled, preset] = await Promise.all([
        ConfigStorage.get('system.soundEnabled'),
        ConfigStorage.get('system.soundPreset'),
      ]);

      if (enabled !== true) return;
      soundNotificationService.play((preset as SoundPreset | undefined) ?? 'chime');
    });

    return () => {
      unsubscribe?.();
    };
  }, []);
}
