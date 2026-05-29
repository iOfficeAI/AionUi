import { describe, expect, it, vi } from 'vitest';
import { PetEventBridge } from '@process/pet/petEventBridge';
import type { PetIdleTicker } from '@process/pet/petIdleTicker';
import type { PetStateMachine } from '@process/pet/petStateMachine';

describe('PetEventBridge', () => {
  it('notifies listeners when confirmations are added and removed', () => {
    const { bridge } = createBridge();
    const listener = vi.fn();
    bridge.onNotificationChange(listener);

    bridge.handleBridgeMessage('confirmation.add', { id: 'confirm-1' });
    bridge.handleBridgeMessage('confirmation.add', { id: 'confirm-2' });
    bridge.handleBridgeMessage('confirmation.remove', { id: 'confirm-1' });

    expect(listener).toHaveBeenNthCalledWith(1, { pendingConfirmations: 0 });
    expect(listener).toHaveBeenNthCalledWith(2, { pendingConfirmations: 1 });
    expect(listener).toHaveBeenNthCalledWith(3, { pendingConfirmations: 2 });
    expect(listener).toHaveBeenNthCalledWith(4, { pendingConfirmations: 1 });
  });

  it('ignores malformed confirmation events', () => {
    const { bridge } = createBridge();
    const listener = vi.fn();
    bridge.onNotificationChange(listener);

    bridge.handleBridgeMessage('confirmation.add', {});
    bridge.handleBridgeMessage('confirmation.remove', { id: '' });

    expect(bridge.getNotificationSummary()).toEqual({ pendingConfirmations: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

function createBridge(): { bridge: PetEventBridge } {
  const sm = {
    requestState: vi.fn(),
  } as unknown as PetStateMachine;
  const ticker = {
    resetIdle: vi.fn(),
  } as unknown as PetIdleTicker;

  return { bridge: new PetEventBridge(sm, ticker) };
}
