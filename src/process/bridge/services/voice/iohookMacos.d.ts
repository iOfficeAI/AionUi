declare module 'iohook-macos' {
  export type IoHookModifierEvent = {
    keyCode?: number;
    flags?: number;
    modifiers: {
      command: boolean;
      option: boolean;
      fn: boolean;
    };
  };

  export type IoHookMacosModule = {
    on: (event: 'flagsChanged' | 'keyDown' | 'keyUp', listener: (event: IoHookModifierEvent) => void) => void;
    startMonitoring: () => void;
    stopMonitoring: () => void;
    checkAccessibilityPermissions: () => { hasPermissions: boolean };
    requestAccessibilityPermissions: () => void;
  };

  const iohookMacos: IoHookMacosModule;
  export default iohookMacos;
}
