import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { expectDiagnostic, expectNoDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';
import {
  ASM_CONTROL_KEYWORD_LIST,
  ASM_CONTROL_KEYWORDS,
  LEGACY_SECTION_DIRECTIVE_KIND_LIST,
  LEGACY_SECTION_DIRECTIVE_KINDS,
  NAMED_SECTION_KIND_LIST,
  NAMED_SECTION_KINDS,
  CONDITION_CODE_LIST,
  CONDITION_CODES,
  IMM_BINARY_OPERATORS,
  IMM_BINARY_OPERATOR_PRECEDENCE,
  IMM_MULTI_CHAR_OPERATORS,
  IMM_OPERATOR_PRECEDENCE,
  IMM_UNARY_OPERATORS,
  IMM_UNARY_OPERATOR_SET,
  MATCHER_TYPE_LIST,
  MATCHER_TYPES,
  RETURN_REGISTERS,
  SCALAR_TYPE_LIST,
  SCALAR_TYPES,
  TOP_LEVEL_KEYWORD_LIST,
  TOP_LEVEL_KEYWORDS,
} from '../../src/frontend/grammarData.js';
import {
  appendParsedAsmStatement,
  parseAsmStatement,
  type AsmControlFrame,
} from '../../src/frontend/parseAsmStatements.js';
import {
  malformedTopLevelHeaderExpectations,
  parseReturnRegsFromText,
} from '../../src/frontend/parseModuleCommon.js';
import { parseOpParamsFromText } from '../../src/frontend/parseParams.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';

function sortedStrings(values: Iterable<string>): string[] {
  return [...values].sort();
}

describe('PR762 grammar-data conformance', () => {
  const file = makeSourceFile('pr762_grammar_data_conformance.zax', '');
  const zeroSpan = span(file, 0, 0);
  const isReservedTopLevelName = (name: string): boolean =>
    TOP_LEVEL_KEYWORDS.has(name.toLowerCase());

  it('keeps the current shared grammar-data exports internally consistent', () => {
    expect(sortedStrings(TOP_LEVEL_KEYWORDS)).toEqual([...TOP_LEVEL_KEYWORD_LIST].sort());
    expect(sortedStrings(ASM_CONTROL_KEYWORDS)).toEqual([...ASM_CONTROL_KEYWORD_LIST].sort());
    expect(sortedStrings(CONDITION_CODES)).toEqual([...CONDITION_CODE_LIST].sort());
    expect(sortedStrings(SCALAR_TYPES)).toEqual([...SCALAR_TYPE_LIST].sort());
    expect(sortedStrings(MATCHER_TYPES)).toEqual([...MATCHER_TYPE_LIST].sort());
    expect(sortedStrings(NAMED_SECTION_KINDS)).toEqual([...NAMED_SECTION_KIND_LIST].sort());
    expect(sortedStrings(LEGACY_SECTION_DIRECTIVE_KINDS)).toEqual(
      [...LEGACY_SECTION_DIRECTIVE_KIND_LIST].sort(),
    );
    expect(sortedStrings(IMM_UNARY_OPERATOR_SET)).toEqual([...IMM_UNARY_OPERATORS].sort());

    const precedenceEntries = IMM_OPERATOR_PRECEDENCE.flatMap(({ level, ops }) =>
      ops.map((op) => [op, level] as const),
    );

    expect([...IMM_BINARY_OPERATOR_PRECEDENCE.entries()].sort()).toEqual(precedenceEntries.sort());
    expect(sortedStrings(IMM_BINARY_OPERATORS)).toEqual(precedenceEntries.map(([op]) => op).sort());
    expect(sortedStrings(IMM_MULTI_CHAR_OPERATORS)).toEqual(
      precedenceEntries
        .map(([op]) => op)
        .filter((op) => op.length > 1)
        .sort(),
    );
  });

  it('keeps malformed top-level header expectations aligned with the top-level grammar keyword list', () => {
    expect(
      malformedTopLevelHeaderExpectations.map((expectation) => expectation.keyword).sort(),
    ).toEqual([...TOP_LEVEL_KEYWORD_LIST].sort());
  });

  it('recognizes every top-level grammar keyword without falling through to unsupported-construct diagnostics', () => {
    const samples: Record<(typeof TOP_LEVEL_KEYWORD_LIST)[number], string> = {
      func: ['func main()', 'end'].join('\n'),
      const: 'const FOO = 1',
      enum: 'enum Mode A',
      data: ['data', 'count: byte = 1'].join('\n'),
      import: 'import "mod.zax"',
      type: ['type Pair', 'left: word', 'right: word', 'end'].join('\n'),
      union: ['union Value', 'w: word', 'end'].join('\n'),
      globals: ['globals', 'count: byte', 'end'].join('\n'),
      var: ['var', 'count: byte', 'end'].join('\n'),
      extern: ['extern', 'func ext(): HL at $1234', 'end'].join('\n'),
      bin: 'bin blob in code from "blob.bin"',
      hex: 'hex blob from "blob.hex"',
      op: ['op nopwrap()', 'nop', 'end'].join('\n'),
      section: ['section data vars', 'count: byte', 'end'].join('\n'),
      align: 'align $10',
    };

    expect(Object.keys(samples).sort()).toEqual([...TOP_LEVEL_KEYWORD_LIST].sort());

    for (const [keyword, source] of Object.entries(samples)) {
      const diagnostics: Diagnostic[] = [];
      parseProgram(`pr762_${keyword}.zax`, source, diagnostics);
      expectNoDiagnostic(diagnostics, { messageIncludes: 'Unsupported top-level construct:' });
      expectNoDiagnostic(diagnostics, {
        messageIncludes: 'Unsupported section-contained construct:',
      });
    }
  });

  it('routes section-kind atoms through the current parser entry points', () => {
    for (const sectionKind of NAMED_SECTION_KIND_LIST) {
      const diagnostics: Diagnostic[] = [];
      const bodyLines = sectionKind === 'code' ? ['func run()', 'end'] : ['count: byte = 1'];

      parseProgram(
        `pr762_named_section_${sectionKind}.zax`,
        [`section ${sectionKind} bucket`, ...bodyLines, 'end'].join('\n'),
        diagnostics,
      );

      expectNoDiagnostics(diagnostics);
    }

    for (const sectionKind of LEGACY_SECTION_DIRECTIVE_KIND_LIST) {
      const diagnostics: Diagnostic[] = [];

      parseProgram(
        `pr762_legacy_section_${sectionKind}.zax`,
        `section ${sectionKind}`,
        diagnostics,
      );
      expect(diagnostics).toHaveLength(1);
      expectDiagnostic(diagnostics, {
        messageIncludes: `Legacy active-counter section directive "section ${sectionKind}" is removed`,
      });
    }
  });
  it('routes every asm control keyword from the grammar baseline through the structured-control parser', () => {
    const samples: Record<
      (typeof ASM_CONTROL_KEYWORD_LIST)[number],
      { text: string; makeStack: () => AsmControlFrame[] }
    > = {
      if: { text: 'if z', makeStack: () => [] },
      else: {
        text: 'else',
        makeStack: () => [{ kind: 'If', elseSeen: false, openSpan: zeroSpan }],
      },
      end: {
        text: 'end',
        makeStack: () => [{ kind: 'If', elseSeen: false, openSpan: zeroSpan }],
      },
      while: { text: 'while z', makeStack: () => [] },
      repeat: { text: 'repeat', makeStack: () => [] },
      until: {
        text: 'until z',
        makeStack: () => [{ kind: 'Repeat', openSpan: zeroSpan }],
      },
      break: {
        text: 'break',
        makeStack: () => [{ kind: 'While', openSpan: zeroSpan }],
      },
      continue: {
        text: 'continue',
        makeStack: () => [{ kind: 'Repeat', openSpan: zeroSpan }],
      },
      select: { text: 'select a', makeStack: () => [] },
      case: {
        text: 'case 1',
        makeStack: () => [{ kind: 'Select', elseSeen: false, armSeen: false, openSpan: zeroSpan }],
      },
    };

    expect(Object.keys(samples).sort()).toEqual([...ASM_CONTROL_KEYWORD_LIST].sort());

    for (const sample of Object.values(samples)) {
      const diagnostics: Diagnostic[] = [];
      const parsed = parseAsmStatement(
        file.path,
        sample.text,
        zeroSpan,
        diagnostics,
        sample.makeStack(),
      );
      const out: Array<{ kind: string }> = [];
      appendParsedAsmStatement(out as any[], parsed);

      expectNoDiagnostics(diagnostics);
      expect(parsed).toBeDefined();
      expect(out.length > 0 || (parsed && !Array.isArray(parsed))).toBe(true);

      if (Array.isArray(parsed)) {
        expect(parsed.every((node) => node.kind === 'Case')).toBe(true);
      } else {
        expect(parsed?.kind).not.toBe('AsmInstruction');
      }
    }
  });

  it('accepts every condition code exported through the grammar baseline', () => {
    for (const cc of CONDITION_CODE_LIST) {
      const diagnostics: Diagnostic[] = [];
      const repeatStack: AsmControlFrame[] = [{ kind: 'Repeat', openSpan: zeroSpan }];

      expect(parseAsmStatement(file.path, `if ${cc}`, zeroSpan, diagnostics, [])).toMatchObject({
        kind: 'If',
        cc,
      });
      expect(parseAsmStatement(file.path, `while ${cc}`, zeroSpan, diagnostics, [])).toMatchObject({
        kind: 'While',
        cc,
      });
      expect(
        parseAsmStatement(file.path, `until ${cc}`, zeroSpan, diagnostics, repeatStack),
      ).toMatchObject({
        kind: 'Until',
        cc,
      });
      expect(diagnostics).toEqual([]);
    }
  });

  it('accepts every matcher type exported through the grammar baseline as a symbolic matcher', () => {
    for (const matcherType of MATCHER_TYPE_LIST) {
      const diagnostics: Diagnostic[] = [];
      const parsed = parseOpParamsFromText(
        file.path,
        `arg: ${matcherType}`,
        zeroSpan,
        diagnostics,
        { isReservedTopLevelName },
      );

      expect(diagnostics).toEqual([]);
      expect(parsed).toHaveLength(1);
      expect(parsed?.[0]?.matcher.kind).not.toBe('MatcherFixed');
    }
  });

  it('accepts every return register exported through the grammar baseline', () => {
    const registers = [...RETURN_REGISTERS];
    const diagnostics: Diagnostic[] = [];

    expect(
      parseReturnRegsFromText(registers.join(', '), zeroSpan, 1, diagnostics, file.path),
    ).toEqual({
      regs: registers,
    });
    expect(diagnostics).toEqual([]);
  });
});
