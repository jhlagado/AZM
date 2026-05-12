import { describe, expect, it } from 'vitest';

import { classifyChangedPaths, isDocsOnlyPath } from '../scripts/ci/change-classifier.js';

describe('PR288: CI docs-only short-circuit classifier', () => {
  it('classifies docs-only sets for docs, markdown, and issue-template updates', () => {
    const result = classifyChangedPaths([
      'docs/archive/versioned/v02-codegen-reference.md',
      'README.md',
      '.github/ISSUE_TEMPLATE/v02-change-task.yml',
    ]);

    expect(result.docsOnly).toBe(true);
    expect(result.runFull).toBe(false);
    expect(result.nonDocPaths).toEqual([]);
  });

  it('classifies source changes as full CI', () => {
    const result = classifyChangedPaths(['src/lowering/emit.ts']);

    expect(result.docsOnly).toBe(false);
    expect(result.runFull).toBe(true);
    expect(result.nonDocPaths).toEqual(['src/lowering/emit.ts']);
  });

  it('classifies mixed docs + source sets as full CI', () => {
    const result = classifyChangedPaths([
      'docs/archive/versioned/v02-codegen-reference.md',
      'test/pr1_minimal.test.ts',
    ]);

    expect(result.docsOnly).toBe(false);
    expect(result.runFull).toBe(true);
    expect(result.nonDocPaths).toEqual(['test/pr1_minimal.test.ts']);
  });

  it('treats workflow edits as non-doc changes', () => {
    expect(isDocsOnlyPath('.github/workflows/ci.yml')).toBe(false);
    const result = classifyChangedPaths(['.github/workflows/ci.yml']);
    expect(result.docsOnly).toBe(false);
    expect(result.runFull).toBe(true);
  });

  it('defaults empty change sets to full CI safety mode', () => {
    const result = classifyChangedPaths([]);
    expect(result.docsOnly).toBe(false);
    expect(result.runFull).toBe(true);
  });
});
