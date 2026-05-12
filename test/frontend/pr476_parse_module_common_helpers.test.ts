import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import {
  consumeKeywordPrefix,
  parseReturnRegsFromText,
  parseVarDeclLine,
  topLevelStartKeyword,
} from '../../src/frontend/parseModuleCommon.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { expectNoDiagnostics } from '../helpers/diagnostics.js';

describe('PR476 module helper extraction', () => {
  const file = makeSourceFile('pr476_parse_module_common_helpers.zax', '');
  const zeroSpan = span(file, 0, 0);

  it('keeps top-level keyword helpers intact', () => {
    expect(consumeKeywordPrefix('export func main()', 'export')).toBe('func main()');
    expect(topLevelStartKeyword('export const FOO = 1')).toBe('const');
    expect(topLevelStartKeyword('nonsense thing')).toBeUndefined();
  });

  it('keeps return register parsing intact', () => {
    const diagnostics: Diagnostic[] = [];
    expect(parseReturnRegsFromText('HL, de', zeroSpan, 1, diagnostics, file.path)).toEqual({
      regs: ['HL', 'DE'],
    });
    expectNoDiagnostics(diagnostics);
  });

  it('keeps var declaration parsing intact', () => {
    const diagnostics: Diagnostic[] = [];
    const decl = parseVarDeclLine('value: word = $12', zeroSpan, 1, 'var', {
      diagnostics,
      modulePath: file.path,
      isReservedTopLevelName: () => false,
    });

    expectNoDiagnostics(diagnostics);
    expect(decl).toMatchObject({
      kind: 'VarDecl',
      name: 'value',
      typeExpr: { kind: 'TypeName', name: 'word' },
      initializer: {
        kind: 'VarInitValue',
        expr: { kind: 'ImmLiteral', value: 0x12 },
      },
    });
  });

  it('parses local typed constant-name initializers as imm expressions', () => {
    const diagnostics: Diagnostic[] = [];
    const decl = parseVarDeclLine('value: word = LastIndex', zeroSpan, 1, 'var', {
      diagnostics,
      modulePath: file.path,
      isReservedTopLevelName: () => false,
    });

    expectNoDiagnostics(diagnostics);
    expect(decl).toMatchObject({
      kind: 'VarDecl',
      name: 'value',
      typeExpr: { kind: 'TypeName', name: 'word' },
      initializer: {
        kind: 'VarInitValue',
        expr: { kind: 'ImmName', name: 'LastIndex' },
      },
    });
  });
});
