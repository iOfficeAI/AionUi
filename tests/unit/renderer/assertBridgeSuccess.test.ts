import { assertBridgeSuccess } from '@/renderer/pages/conversation/platforms/assertBridgeSuccess';

describe('assertBridgeSuccess', () => {
  it('accepts successful bridge responses', () => {
    expect(() => {
      assertBridgeSuccess({ success: true, data: { ok: true } }, 'fallback');
    }).not.toThrow();
  });

  it('throws the bridge error message when the response is unsuccessful', () => {
    expect(() => {
      assertBridgeSuccess({ success: false, msg: 'conversation already running' }, 'fallback');
    }).toThrow('conversation already running');
  });

  it('falls back to the provided message when the bridge response is empty', () => {
    expect(() => {
      assertBridgeSuccess(undefined, 'fallback');
    }).toThrow('fallback');
  });
});
