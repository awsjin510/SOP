import type { ChangeIntent } from '@/core/ir/schemas';

export interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemver(version: string): SemverParts {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) {
    throw new Error(`非合法 semver: ${version}`);
  }
  return {
    major: parseInt(m[1]!, 10),
    minor: parseInt(m[2]!, 10),
    patch: parseInt(m[3]!, 10),
  };
}

export function formatSemver(parts: SemverParts): string {
  return `${parts.major}.${parts.minor}.${parts.patch}`;
}

export type BumpKind = 'major' | 'minor' | 'patch';

export function bumpSemver(version: string, kind: BumpKind): string {
  const v = parseSemver(version);
  switch (kind) {
    case 'major':
      return formatSemver({ major: v.major + 1, minor: 0, patch: 0 });
    case 'minor':
      return formatSemver({ major: v.major, minor: v.minor + 1, patch: 0 });
    case 'patch':
      return formatSemver({
        major: v.major,
        minor: v.minor,
        patch: v.patch + 1,
      });
  }
}

/**
 * 依規格 docs/data-model.md 推得的 bump 規則：
 * - 任一 intent 標 breaking_change → major
 * - 任一 add_step / add_troubleshooting / add_glossary → minor
 * - 否則 patch
 */
export function decideBumpKind(intents: ChangeIntent[]): BumpKind {
  const hasBreaking = intents.some((i) => i.impact?.breaking_change === true);
  if (hasBreaking) return 'major';

  const hasAdd = intents.some(
    (i) =>
      i.type === 'add_step' ||
      i.type === 'add_troubleshooting' ||
      i.type === 'add_glossary',
  );
  if (hasAdd) return 'minor';

  return 'patch';
}

export function bumpForIntents(currentVersion: string, intents: ChangeIntent[]): {
  kind: BumpKind;
  newVersion: string;
} {
  const kind = decideBumpKind(intents);
  return { kind, newVersion: bumpSemver(currentVersion, kind) };
}
