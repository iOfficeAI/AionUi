import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getCurrentProject,
  resetCurrentProjectForTest,
  setCurrentProject,
  subscribeCurrentProject,
} from '@/renderer/pages/conversation/explorer/currentProjectStore';

afterEach(() => resetCurrentProjectForTest());

describe('currentProjectStore', () => {
  it('sets and reads the current project id', () => {
    setCurrentProject('proj-1');
    expect(getCurrentProject()).toBe('proj-1');
    setCurrentProject(null);
    expect(getCurrentProject()).toBeNull();
  });

  it('notifies subscribers only when the value actually changes (same value = no-op)', () => {
    const listener = vi.fn();
    subscribeCurrentProject(listener);

    setCurrentProject('proj-1');
    expect(listener).toHaveBeenCalledTimes(1);

    // Same value again → no notify (this is what keeps the Layout column from
    // remounting across same-project conversation switches).
    setCurrentProject('proj-1');
    expect(listener).toHaveBeenCalledTimes(1);

    setCurrentProject('proj-2');
    expect(listener).toHaveBeenCalledTimes(2);
    setCurrentProject(null);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const off = subscribeCurrentProject(listener);
    setCurrentProject('a');
    off();
    setCurrentProject('b');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
