/**
 * @vitest-environment jsdom
 */

/**
 * The switch is read by four unrelated components (settings, disabled banner,
 * send box, loop warning). With a per-hook `useState` copy they disagreed:
 * "resume" on the banner hid the banner while the send box still refused `@@`.
 * These tests pin the shared-store behaviour that fixes it.
 */

import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock, setMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  setMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    systemSettings: {
      getCrossSessionMessageEnabled: { invoke: getMock },
      setCrossSessionMessageEnabled: { invoke: setMock },
    },
  },
}));

const importHook = async () => await import('@/renderer/hooks/chat/useCrossSessionMessageEnabled');

/** Two independent consumers, exactly as the real tree has. */
const Consumers: React.FC<{
  useHook: () => { enabled: boolean; setEnabled: (next: boolean) => Promise<void> };
}> = ({ useHook }) => {
  const a = useHook();
  const b = useHook();
  return (
    <div>
      <span data-testid='a'>{String(a.enabled)}</span>
      <span data-testid='b'>{String(b.enabled)}</span>
      <button type='button' onClick={() => void a.setEnabled(false).catch(() => {})}>
        a-off
      </button>
      <button type='button' onClick={() => void b.setEnabled(true).catch(() => {})}>
        b-on
      </button>
    </div>
  );
};

describe('useCrossSessionMessageEnabled', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    getMock.mockResolvedValue({ cross_session_message_enabled: true });
    setMock.mockResolvedValue(undefined);
    const { resetCrossSessionMessageEnabledCache } = await importHook();
    act(() => {
      resetCrossSessionMessageEnabledCache();
    });
  });

  it('defaults to enabled before the settings read resolves', async () => {
    const { useCrossSessionMessageEnabled } = await importHook();
    await act(async () => {
      render(<Consumers useHook={useCrossSessionMessageEnabled} />);
    });
    expect(screen.getByTestId('a').textContent).toBe('true');
  });

  it('stays enabled when the settings read fails', async () => {
    getMock.mockRejectedValue(new Error('offline'));
    const { useCrossSessionMessageEnabled } = await importHook();
    await act(async () => {
      render(<Consumers useHook={useCrossSessionMessageEnabled} />);
    });
    expect(screen.getByTestId('a').textContent).toBe('true');
  });

  it('adopts a disabled value from the backend', async () => {
    getMock.mockResolvedValue({ cross_session_message_enabled: false });
    const { useCrossSessionMessageEnabled } = await importHook();
    await act(async () => {
      render(<Consumers useHook={useCrossSessionMessageEnabled} />);
    });
    expect(screen.getByTestId('a').textContent).toBe('false');
    expect(screen.getByTestId('b').textContent).toBe('false');
  });

  it('reads the setting once no matter how many consumers mount', async () => {
    const { useCrossSessionMessageEnabled } = await importHook();
    await act(async () => {
      render(<Consumers useHook={useCrossSessionMessageEnabled} />);
    });
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  // The regression: one consumer flipping the switch must move every other one.
  it('propagates a change made by one consumer to all the others', async () => {
    const { useCrossSessionMessageEnabled } = await importHook();
    await act(async () => {
      render(<Consumers useHook={useCrossSessionMessageEnabled} />);
    });

    await act(async () => {
      screen.getByText('a-off').click();
    });
    expect(screen.getByTestId('a').textContent).toBe('false');
    expect(screen.getByTestId('b').textContent).toBe('false');

    await act(async () => {
      screen.getByText('b-on').click();
    });
    expect(screen.getByTestId('a').textContent).toBe('true');
    expect(screen.getByTestId('b').textContent).toBe('true');
  });

  it('rolls every consumer back when the backend rejects the write', async () => {
    setMock.mockRejectedValue(new Error('boom'));
    const { useCrossSessionMessageEnabled } = await importHook();
    await act(async () => {
      render(<Consumers useHook={useCrossSessionMessageEnabled} />);
    });

    await act(async () => {
      screen.getByText('a-off').click();
    });

    expect(screen.getByTestId('a').textContent).toBe('true');
    expect(screen.getByTestId('b').textContent).toBe('true');
  });

  it('writes through the typed settings endpoint', async () => {
    const { useCrossSessionMessageEnabled } = await importHook();
    await act(async () => {
      render(<Consumers useHook={useCrossSessionMessageEnabled} />);
    });
    await act(async () => {
      screen.getByText('a-off').click();
    });
    expect(setMock).toHaveBeenCalledWith({ enabled: false });
  });
});
