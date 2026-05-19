import { describe, expect, it } from 'vitest';
import {
  parseSemver,
  formatSemver,
  bumpSemver,
  decideBumpKind,
  bumpForIntents,
} from './version';
import type { ChangeIntent } from '@/core/ir/schemas';

const intent = (
  type: ChangeIntent['type'],
  impact: ChangeIntent['impact'] = {},
): ChangeIntent => ({
  intent_id: `intent-${Math.random().toString(36).slice(2, 12)}`,
  type,
  target: {},
  description: 'test',
  source_refs: [
    { source_file: 'x.md', extractor_type: 'change_list', excerpt: 'x' },
  ],
  confidence: 0.9,
  ...(impact ? { impact } : {}),
  status: 'pending',
});

describe('parseSemver / formatSemver', () => {
  it('round-trips a valid semver', () => {
    expect(formatSemver(parseSemver('1.3.7'))).toBe('1.3.7');
  });

  it('throws on invalid input', () => {
    expect(() => parseSemver('1.3')).toThrow();
    expect(() => parseSemver('v1.0.0')).toThrow();
  });
});

describe('bumpSemver', () => {
  it('bumps major and resets minor/patch', () => {
    expect(bumpSemver('1.2.3', 'major')).toBe('2.0.0');
  });
  it('bumps minor and resets patch', () => {
    expect(bumpSemver('1.2.3', 'minor')).toBe('1.3.0');
  });
  it('bumps patch only', () => {
    expect(bumpSemver('1.2.3', 'patch')).toBe('1.2.4');
  });
});

describe('decideBumpKind', () => {
  it('returns major when any intent is breaking_change', () => {
    expect(
      decideBumpKind([
        intent('modify_step', { breaking_change: true }),
        intent('add_tip'),
      ]),
    ).toBe('major');
  });

  it('returns minor when an add_step exists without breaking', () => {
    expect(
      decideBumpKind([intent('add_step'), intent('modify_step')]),
    ).toBe('minor');
  });

  it('returns minor for add_troubleshooting / add_glossary', () => {
    expect(decideBumpKind([intent('add_troubleshooting')])).toBe('minor');
    expect(decideBumpKind([intent('add_glossary')])).toBe('minor');
  });

  it('returns patch for tip / warning / modify-only changes', () => {
    expect(
      decideBumpKind([
        intent('add_tip'),
        intent('add_warning'),
        intent('modify_step'),
      ]),
    ).toBe('patch');
  });

  it('returns patch when intents is empty', () => {
    expect(decideBumpKind([])).toBe('patch');
  });
});

describe('bumpForIntents', () => {
  it('combines decideBumpKind with bumpSemver', () => {
    expect(
      bumpForIntents('1.2.0', [intent('add_step')]),
    ).toEqual({ kind: 'minor', newVersion: '1.3.0' });
  });
});
