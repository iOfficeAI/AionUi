/**
 * @vitest-environment node
 */

import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { formatActivityTime } from '@/renderer/pages/team/activity/activityTime';

describe('formatActivityTime', () => {
  const now = dayjs('2026-07-31T10:00:00').valueOf();

  it('shows HH:mm for same-day timestamps', () => {
    expect(formatActivityTime(dayjs('2026-07-31T08:30:00').valueOf(), now).label).toBe('08:30');
  });

  it('shows MM-DD HH:mm for same-year, different-day timestamps', () => {
    expect(formatActivityTime(dayjs('2026-07-27T08:16:41').valueOf(), now).label).toBe('07-27 08:16');
  });

  it('shows YYYY-MM-DD HH:mm for earlier years', () => {
    expect(formatActivityTime(dayjs('2025-12-31T23:59:00').valueOf(), now).label).toBe('2025-12-31 23:59');
  });

  it('exposes a full timestamp for tooltips', () => {
    expect(formatActivityTime(dayjs('2026-07-27T08:16:41').valueOf(), now).full).toBe('2026-07-27 08:16:41');
  });
});
