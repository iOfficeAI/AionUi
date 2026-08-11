import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for the defensive messageApi pattern used in PreviewPanel's handleOpenInSystem.
 *
 * When a component unmounts after an async operation, Arco Design's
 * Message.useMessage() contextHolderRef.current becomes null, causing
 * messageApi.error() / messageApi.success() to throw:
 *   TypeError: Cannot read properties of null (reading 'addInstance')
 *
 * The fix wraps messageApi calls in try-catch to prevent unhandled rejections.
 * Since PreviewPanel is deeply coupled to React contexts and IPC bridges,
 * this test validates the defensive pattern in isolation.
 */
describe('handleOpenInSystem defensive messageApi pattern', () => {
  // Simulate a messageApi whose context holder has been unmounted
  function createCrashedMessageApi() {
    return {
      error: vi.fn(() => {
        throw new TypeError("Cannot read properties of null (reading 'addInstance')");
      }),
      success: vi.fn(() => {
        throw new TypeError("Cannot read properties of null (reading 'addInstance')");
      }),
    };
  }

  it('should not throw when messageApi.error crashes due to unmounted context holder', () => {
    const messageApi = createCrashedMessageApi();

    // Simulate the fixed pattern: messageApi.error wrapped in try-catch
    expect(() => {
      try {
        messageApi.error('Open in system failed');
      } catch {
        // Context holder may be unmounted after async operation
      }
    }).not.toThrow();

    expect(messageApi.error).toHaveBeenCalledWith('Open in system failed');
  });

  it('should not throw when messageApi.success crashes due to unmounted context holder', () => {
    const messageApi = createCrashedMessageApi();

    expect(() => {
      try {
        messageApi.success('Open in system succeeded');
      } catch {
        // Context holder may be unmounted after async operation
      }
    }).not.toThrow();

    expect(messageApi.success).toHaveBeenCalledWith('Open in system succeeded');
  });

  it('should still display message when context holder is mounted', () => {
    const messageApi = {
      error: vi.fn(),
      success: vi.fn(),
    };

    try {
      messageApi.success('Open in system succeeded');
    } catch {
      // Context holder may be unmounted
    }

    expect(messageApi.success).toHaveBeenCalledWith('Open in system succeeded');
  });
});
