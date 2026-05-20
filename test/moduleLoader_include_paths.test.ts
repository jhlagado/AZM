import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { normalizePath } from '../src/compileShared.js';
import { resolveIncludeCandidates } from '../src/moduleLoaderIncludePaths.js';

describe('moduleLoaderIncludePaths', () => {
  it('orders relative-to-importer first, then each include dir in order', () => {
    const fromModule = resolve('/fake/project', 'src', 'entry.zax');
    const spec = 'shared.inc';
    const incA = resolve('/fake', 'include-a');
    const incB = resolve('/fake', 'include-b');
    const includeDirs = [incA, incB];

    const got = resolveIncludeCandidates(fromModule, spec, includeDirs);
    const fromDir = dirname(fromModule);

    expect(got[0]).toBe(normalizePath(resolve(fromDir, spec)));
    expect(got[1]).toBe(normalizePath(resolve(incA, spec)));
    expect(got[2]).toBe(normalizePath(resolve(incB, spec)));
    expect(got).toHaveLength(3);
  });

  it('dedupes identical normalized paths while preserving first occurrence', () => {
    const dir = resolve('/fake', 'dup-test');
    const fromModule = resolve(dir, 'mod.zax');
    const spec = 'x.inc';
    const same = dir;
    const got = resolveIncludeCandidates(fromModule, spec, [same, same]);

    expect(got).toHaveLength(1);
    expect(got[0]).toBe(normalizePath(resolve(dir, spec)));
  });

  it('skips include-dir steps that duplicate an earlier candidate', () => {
    const sharedDir = resolve('/fake', 'shared');
    const fromModule = resolve(sharedDir, 'entry.zax');
    const spec = 'u.inc';
    const other = resolve('/fake', 'other');
    const got = resolveIncludeCandidates(fromModule, spec, [sharedDir, other, sharedDir]);

    const first = normalizePath(resolve(dirname(fromModule), spec));
    const fromOther = normalizePath(resolve(other, spec));
    expect(got).toEqual([first, fromOther]);
    expect(got).toHaveLength(2);
  });
});
