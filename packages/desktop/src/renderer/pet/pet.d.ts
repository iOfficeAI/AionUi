interface PetAPI {
  onStateChange: (cb: (state: string) => void) => void;
  onEyeMove: (cb: (data: { eyeDx: number; eyeDy: number; bodyDx: number; bodyRotate: number }) => void) => void;
  onResize: (cb: (size: number) => void) => void;
  onNotificationSummary: (cb: (data: { pendingConfirmations: number }) => void) => void;
  onAssetChange: (cb: (asset: PetAssetPackage) => void) => void;
}

type PetAssetPackage = {
  id: string;
  displayName: string;
  description: string;
  format: 'svg-states' | 'codex-spritesheet';
  source: 'builtin' | 'custom';
  spritesheetUrl?: string;
};

interface PetHitAPI {
  dragStart: () => void;
  dragEnd: () => void;
  click: (data: { side: string; count: number }) => void;
  contextMenu: () => void;
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
  onHitReset: (cb: () => void) => void;
}

interface PetConfirmAPI {
  onConfirmationAdd: (callback: (data: unknown) => void) => void;
  onConfirmationUpdate: (callback: (data: unknown) => void) => void;
  onConfirmationRemove: (callback: (data: unknown) => void) => void;
  onThemeChange: (callback: (theme: string) => void) => void;
  respond: (data: { conversation_id: string; msg_id: string; call_id: string; data: unknown }) => void;
  dragStart: () => void;
  dragEnd: () => void;
}

interface Window {
  petAPI: PetAPI;
  petHitAPI: PetHitAPI;
  petConfirmAPI: PetConfirmAPI;
}
