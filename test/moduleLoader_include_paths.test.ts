import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { normalizePath } from '../src/compileShared.js';
import type { ImportNode, ModuleFileNode, SourceSpan, UnimplementedNode } from '../src/frontend/ast.js';
import {
  importCandidatePath,
  importTargets,
  resolveImportCandidates,
  resolveIncludeCandidates,
} from '../src/moduleLoaderIncludePaths.js';

function dummySpan(file: string): SourceSpan {
  return {
    file,
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  };
}

describe('moduleLoaderIncludePaths', () => {
  describe('resolveIncludeCandidates', () => {
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

    it('skips include-dir steps that duplicate an earlier candidate (including same as relative)', () => {
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

  describe('resolveImportCandidates', () => {
    it('uses path form verbatim as the relative segment', () => {
      const fromModule = resolve('/fake', 'm', 'main.zax');
      const imp: ImportNode = {
        kind: 'Import',
        form: 'path',
        specifier: 'lib/extra.zax',
        span: dummySpan(fromModule),
      };
      const got = resolveImportCandidates(fromModule, imp, []);
      expect(got).toHaveLength(1);
      expect(got[0]).toBe(normalizePath(resolve(dirname(fromModule), 'lib/extra.zax')));
    });

    it('appends .zax for moduleId form before resolving', () => {
      const fromModule = resolve('/fake', 'm', 'main.zax');
      const imp: ImportNode = {
        kind: 'Import',
        form: 'moduleId',
        specifier: 'util',
        span: dummySpan(fromModule),
      };
      const inc = resolve('/fake', 'vendor');
      const got = resolveImportCandidates(fromModule, imp, [inc]);
      const fromDir = dirname(fromModule);
      expect(got[0]).toBe(normalizePath(resolve(fromDir, 'util.zax')));
      expect(got[1]).toBe(normalizePath(resolve(inc, 'util.zax')));
    });
  });

  describe('importCandidatePath', () => {
    it('returns path form specifier unchanged', () => {
      const imp: ImportNode = {
        kind: 'Import',
        form: 'path',
        specifier: './foo/bar.zax',
        span: dummySpan('x'),
      };
      expect(importCandidatePath(imp)).toBe('./foo/bar.zax');
    });

    it('appends .zax for moduleId form', () => {
      const imp: ImportNode = {
        kind: 'Import',
        form: 'moduleId',
        specifier: 'MyMod',
        span: dummySpan('x'),
      };
      expect(importCandidatePath(imp)).toBe('MyMod.zax');
    });
  });

  describe('importTargets', () => {
    it('returns only Import items in file order', () => {
      const a: ImportNode = {
        kind: 'Import',
        form: 'moduleId',
        specifier: 'A',
        span: dummySpan('m.zax'),
      };
      const b: ImportNode = {
        kind: 'Import',
        form: 'path',
        specifier: './b.zax',
        span: dummySpan('m.zax'),
      };
      const filler: UnimplementedNode = {
        kind: 'Unimplemented',
        note: 'test',
        span: dummySpan('m.zax'),
      };
      const mod: ModuleFileNode = {
        kind: 'ModuleFile',
        path: 'm.zax',
        moduleId: 'm',
        span: dummySpan('m.zax'),
        items: [a, filler, b],
      };
      expect(importTargets(mod)).toEqual([a, b]);
    });
  });
});
