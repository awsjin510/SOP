import { describe, expect, it } from 'vitest';
import {
  classifyFile,
  detectDocumentFormat,
  detectScreenshotMime,
} from './create-sop';

function makeFile(name: string, type: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('classifyFile', () => {
  it('treats images as screenshots', () => {
    expect(classifyFile(makeFile('shot.png', 'image/png'))).toBe('screenshot');
    expect(classifyFile(makeFile('shot.jpg', 'image/jpeg'))).toBe('screenshot');
    expect(classifyFile(makeFile('shot.webp', 'image/webp'))).toBe('screenshot');
  });

  it('treats docx + pdf as documents', () => {
    expect(
      classifyFile(
        makeFile(
          'a.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ),
    ).toBe('document');
    expect(classifyFile(makeFile('m.pdf', 'application/pdf'))).toBe('document');
  });

  it('falls back to transcript for plain text', () => {
    expect(classifyFile(makeFile('chat.txt', 'text/plain'))).toBe('transcript');
    expect(classifyFile(makeFile('notes.md', 'text/markdown'))).toBe('transcript');
  });

  it('uses filename when MIME is missing', () => {
    expect(classifyFile(makeFile('manual.pdf', ''))).toBe('document');
    expect(classifyFile(makeFile('manual.docx', ''))).toBe('document');
  });
});

describe('detectDocumentFormat', () => {
  it('returns pdf for .pdf', () => {
    expect(detectDocumentFormat(makeFile('a.pdf', 'application/pdf'))).toBe('pdf');
  });
  it('returns docx for .docx', () => {
    expect(
      detectDocumentFormat(
        makeFile(
          'a.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ),
    ).toBe('docx');
  });
});

describe('detectScreenshotMime', () => {
  it('returns matching mime', () => {
    expect(detectScreenshotMime(makeFile('a.png', 'image/png'))).toBe('image/png');
    expect(detectScreenshotMime(makeFile('a.jpg', 'image/jpeg'))).toBe('image/jpeg');
    expect(detectScreenshotMime(makeFile('a.webp', 'image/webp'))).toBe('image/webp');
  });
  it('falls back to png when uncertain', () => {
    expect(detectScreenshotMime(makeFile('weird', ''))).toBe('image/png');
  });
});
