import { describe, expect, it } from 'vitest';
import {
  classifyUpdateFile,
  detectScreenshotMime,
} from './update-sop';

function makeFile(name: string, type: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('classifyUpdateFile', () => {
  it('classifies images as screenshot', () => {
    expect(classifyUpdateFile(makeFile('a.png', 'image/png'))).toBe('screenshot');
    expect(classifyUpdateFile(makeFile('b.webp', 'image/webp'))).toBe('screenshot');
  });

  it('classifies pdf', () => {
    expect(classifyUpdateFile(makeFile('release.pdf', 'application/pdf'))).toBe('pdf');
    expect(classifyUpdateFile(makeFile('release.pdf', ''))).toBe('pdf');
  });

  it('classifies docx + md as change_list', () => {
    expect(
      classifyUpdateFile(
        makeFile(
          'changes.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ),
    ).toBe('change_list');
    expect(classifyUpdateFile(makeFile('notes.md', 'text/markdown'))).toBe(
      'change_list',
    );
  });

  it('falls back to text for plain .txt', () => {
    expect(classifyUpdateFile(makeFile('meeting.txt', 'text/plain'))).toBe('text');
    expect(classifyUpdateFile(makeFile('bug.txt', ''))).toBe('text');
  });
});

describe('detectScreenshotMime', () => {
  it('handles jpeg/jpg variants', () => {
    expect(detectScreenshotMime(makeFile('a.jpg', 'image/jpeg'))).toBe('image/jpeg');
    expect(detectScreenshotMime(makeFile('a.jpeg', ''))).toBe('image/jpeg');
  });

  it('handles webp', () => {
    expect(detectScreenshotMime(makeFile('a.webp', 'image/webp'))).toBe('image/webp');
  });

  it('defaults to png', () => {
    expect(detectScreenshotMime(makeFile('a.png', 'image/png'))).toBe('image/png');
    expect(detectScreenshotMime(makeFile('a.unknown', ''))).toBe('image/png');
  });
});
