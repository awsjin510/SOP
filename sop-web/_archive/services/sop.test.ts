import { describe, expect, it, vi } from 'vitest';

// Avoid initialising firebase in the test
vi.mock('@/firebase/config', () => ({
  auth: {},
  db: {},
  storage: {},
  functions: {},
}));

import { slugify, generateFallbackSopId } from './sop';

describe('slugify', () => {
  it('converts to kebab-case ascii', () => {
    expect(slugify('EC2 Provisioning')).toBe('ec2-provisioning');
  });

  it('strips non-ascii characters (Chinese title yields empty)', () => {
    expect(slugify('啟動 EC2')).toBe('ec2');
  });

  it('returns empty for purely Chinese title', () => {
    expect(slugify('啟動測試')).toBe('');
  });

  it('collapses multiple separators', () => {
    expect(slugify('foo   bar / baz')).toBe('foo-bar-baz');
  });
});

describe('generateFallbackSopId', () => {
  it('prefixes nanoid with sop-', () => {
    const id = generateFallbackSopId(() => 'abc12345');
    expect(id).toBe('sop-abc12345');
  });

  it('produces ids matching the schema regex', () => {
    const id = generateFallbackSopId(() => 'abc12345');
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});
