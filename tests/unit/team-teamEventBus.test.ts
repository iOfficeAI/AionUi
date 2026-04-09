// tests/unit/team-teamEventBus.test.ts
import { describe, it, expect, vi } from 'vitest';
import { teamEventBus } from '@process/team/teamEventBus';

describe('teamEventBus', () => {
  it('is an EventEmitter instance', () => {
    expect(typeof teamEventBus.on).toBe('function');
    expect(typeof teamEventBus.emit).toBe('function');
    expect(typeof teamEventBus.removeListener).toBe('function');
  });

  it('allows up to 50 listeners without warning (maxListeners=50)', () => {
    expect(teamEventBus.getMaxListeners()).toBe(50);
  });

  it('emits responseStream events to registered listeners', () => {
    const listener = vi.fn();
    teamEventBus.on('responseStream', listener);

    const msg = {
      type: 'text',
      conversation_id: 'conv-1',
      msg_id: 'msg-1',
      data: { text: 'hello' },
    };
    teamEventBus.emit('responseStream', msg);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(msg);

    teamEventBus.removeListener('responseStream', listener);
  });

  it('can register and unregister multiple listeners', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    teamEventBus.on('responseStream', listener1);
    teamEventBus.on('responseStream', listener2);

    teamEventBus.emit('responseStream', { type: 'text', conversation_id: 'c', msg_id: 'm', data: null });

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();

    teamEventBus.removeListener('responseStream', listener1);
    teamEventBus.removeListener('responseStream', listener2);
  });

  it('stops receiving events after removeListener', () => {
    const listener = vi.fn();
    teamEventBus.on('responseStream', listener);
    teamEventBus.removeListener('responseStream', listener);

    teamEventBus.emit('responseStream', { type: 'text', conversation_id: 'c', msg_id: 'm', data: null });

    expect(listener).not.toHaveBeenCalled();
  });

  it('delivers events to multiple listeners independently', () => {
    const calls: number[] = [];
    const l1 = () => calls.push(1);
    const l2 = () => calls.push(2);

    teamEventBus.on('responseStream', l1);
    teamEventBus.on('responseStream', l2);

    teamEventBus.emit('responseStream', { type: 'finish', conversation_id: 'c', msg_id: 'm', data: null });

    expect(calls).toContain(1);
    expect(calls).toContain(2);

    teamEventBus.removeListener('responseStream', l1);
    teamEventBus.removeListener('responseStream', l2);
  });
});
