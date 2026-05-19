import { describe, expect, it } from 'vitest';
import {
  isAfterConsistent,
  jaccardSimilarity,
  normalizeForCompare,
} from './similarity';

describe('similarity', () => {
  it('normalizes punctuation and whitespace', () => {
    expect(normalizeForCompare(' Hello,  World!  ')).toBe('hello world');
    expect(normalizeForCompare('改用「IAM Role」進行授權')).toContain('iam role');
  });

  it('jaccard returns 1 for identical and 0 for disjoint', () => {
    expect(jaccardSimilarity('IAM Role', 'IAM Role')).toBe(1);
    expect(jaccardSimilarity('hello', 'world')).toBeLessThan(0.5);
  });

  it('treats CJK bigram overlap as similar', () => {
    expect(
      jaccardSimilarity('改用 IAM Role 進行授權', '改用 IAM 角色進行授權'),
    ).toBeGreaterThan(0.4);
  });

  it('isAfterConsistent: empty pair → consistent', () => {
    expect(isAfterConsistent('', '')).toBe(true);
  });

  it('isAfterConsistent: one empty → not consistent', () => {
    expect(isAfterConsistent('something', '')).toBe(false);
  });
});
