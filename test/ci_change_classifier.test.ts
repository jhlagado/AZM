import { describe, expect, it } from 'vitest';

import { classifyChangedPaths, isDocsOnlyPath } from '../scripts/ci/change-classifier.js';

describe('ci change classifier', () => {
  it('detects docs-only paths', () => {
    expect(isDocsOnlyPath('docs/readme.md')).toBe(true);
    expect(isDocsOnlyPath('notes/notes.md')).toBe(true); // markdown anywhere
    expect(isDocsOnlyPath('src/main.ts')).toBe(false);
  });

  it('classifies mixed and docs-only sets', () => {
    expect(classifyChangedPaths(['docs/a.md', 'docs/sub/b.txt'])).toEqual({
      docsOnly: true,
      runFull: false,
      docsPaths: ['docs/a.md', 'docs/sub/b.txt'],
      nonDocPaths: [],
    });

    expect(classifyChangedPaths(['docs/a.md', 'src/code.ts'])).toEqual({
      docsOnly: false,
      runFull: true,
      docsPaths: ['docs/a.md'],
      nonDocPaths: ['src/code.ts'],
    });
  });
});
