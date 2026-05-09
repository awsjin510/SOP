import { describe, expect, it } from 'vitest';
import { currentYearMonth, usageDocId } from './usage';

describe('usage helpers', () => {
  it('formats GMT+8 year-month as YYYY-MM', () => {
    // 2026-05-08 17:30 UTC → 2026-05-09 01:30 GMT+8 → '2026-05'
    const ym = currentYearMonth(new Date('2026-05-08T17:30:00Z'));
    expect(ym).toBe('2026-05');
  });

  it('rolls over to next month at GMT+8 boundary', () => {
    // 2026-05-31 17:00 UTC → 2026-06-01 01:00 GMT+8 → '2026-06'
    const ym = currentYearMonth(new Date('2026-05-31T17:00:00Z'));
    expect(ym).toBe('2026-06');
  });

  it('builds a stable usage doc id', () => {
    expect(usageDocId('uid-abc', '2026-05')).toBe('uid-abc_2026-05');
  });
});
