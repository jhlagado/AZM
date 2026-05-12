import type { AsmItemNode, SourceSpan } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import {
  isBareAsmControlKeyword,
  parseAsmConditionKeyword,
  parseAsmKeywordTail,
  parseSelectOperandFromText,
} from './parseAsmControlHelpers.js';
import { parseCaseValuesFromText } from './parseAsmCaseValues.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { immLiteral } from './parseImm.js';
import { parseAsmInstruction } from './parseAsmInstruction.js';
import {
  ASM_CONTROL_KEYWORDS,
  CONDITION_CODES,
  CONDITION_CODE_LIST,
} from './grammarData.js';

export type AsmControlFrame =
  | { kind: 'If'; elseSeen: boolean; openSpan: SourceSpan; recoverOnly?: boolean }
  | { kind: 'While'; openSpan: SourceSpan; recoverOnly?: boolean }
  | { kind: 'Repeat'; openSpan: SourceSpan }
  | {
      kind: 'Select';
      elseSeen: boolean;
      armSeen: boolean;
      openSpan: SourceSpan;
      recoverOnly?: boolean;
    };

export function isRecoverOnlyControlFrame(frame: AsmControlFrame): boolean {
  return (
    (frame.kind === 'If' || frame.kind === 'While' || frame.kind === 'Select') &&
    frame.recoverOnly === true
  );
}

export type ParsedAsmStatement = AsmItemNode | AsmItemNode[] | undefined;
export type ParseAsmStatementOptions = {
  allowedConditionIdentifiers?: ReadonlySet<string>;
};

type ParseAsmStatementContext = {
  filePath: string;
  stmtSpan: SourceSpan;
  diagnostics: Diagnostic[];
  controlStack: AsmControlFrame[];
  options?: ParseAsmStatementOptions;
};

export function appendParsedAsmStatement(out: AsmItemNode[], parsed: ParsedAsmStatement): void {
  if (!parsed) return;
  if (Array.isArray(parsed)) {
    out.push(...parsed);
    return;
  }
  out.push(parsed);
}

function parseConditionCode(
  filePath: string,
  keyword: 'if' | 'while' | 'until',
  rawToken: string,
  stmtSpan: SourceSpan,
  diagnostics: Diagnostic[],
  options?: ParseAsmStatementOptions,
): string {
  const cc = rawToken.toLowerCase();
  if (CONDITION_CODES.has(cc)) return cc;
  if (options?.allowedConditionIdentifiers?.has(cc)) return cc;
  diag(
    diagnostics,
    filePath,
    `Invalid ${keyword} condition code "${rawToken}": expected ${CONDITION_CODE_LIST.join(', ')}.`,
    {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    },
  );
  return '__missing__';
}

function firstAsmControlKeyword(text: string): string | undefined {
  const head = text.match(/^[A-Za-z]+/)?.[0]?.toLowerCase();
  if (!head || !ASM_CONTROL_KEYWORDS.has(head)) return undefined;
  const next = text[head.length];
  return next === undefined || !/[A-Za-z0-9_]/.test(next) ? head : undefined;
}

function parseRepeatStatement(trimmed: string, ctx: ParseAsmStatementContext): ParsedAsmStatement {
  const { filePath, stmtSpan, diagnostics, controlStack } = ctx;
  if (isBareAsmControlKeyword(trimmed, 'repeat')) {
    controlStack.push({ kind: 'Repeat', openSpan: stmtSpan });
    return { kind: 'Repeat', span: stmtSpan };
  }
  diag(diagnostics, filePath, `"repeat" does not take operands`, {
    line: stmtSpan.start.line,
    column: stmtSpan.start.column,
  });
  return undefined;
}

function hasEnclosingLoop(controlStack: AsmControlFrame[]): boolean {
  return controlStack.some((frame) => frame.kind === 'While' || frame.kind === 'Repeat');
}

function parseLoopEscapeStatement(
  trimmed: string,
  keyword: 'break' | 'continue',
  ctx: ParseAsmStatementContext,
): ParsedAsmStatement {
  const { filePath, stmtSpan, diagnostics, controlStack } = ctx;
  if (!isBareAsmControlKeyword(trimmed, keyword)) {
    diag(diagnostics, filePath, `"${keyword}" does not take operands`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }
  if (!hasEnclosingLoop(controlStack)) {
    diag(diagnostics, filePath, `"${keyword}" is only valid inside "while" or "repeat"`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }
  return { kind: keyword === 'break' ? 'Break' : 'Continue', span: stmtSpan };
}

function parseElseStatement(trimmed: string, ctx: ParseAsmStatementContext): ParsedAsmStatement {
  const { filePath, stmtSpan, diagnostics, controlStack } = ctx;
  if (!isBareAsmControlKeyword(trimmed, 'else')) {
    diag(diagnostics, filePath, `"else" does not take operands`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }

  const top = controlStack[controlStack.length - 1];
  if (top?.kind === 'Select') {
    if (top.elseSeen) {
      diag(diagnostics, filePath, `"else" duplicated in select`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    top.elseSeen = true;
    top.armSeen = true;
    return { kind: 'SelectElse', span: stmtSpan };
  }
  if (top?.kind !== 'If') {
    diag(diagnostics, filePath, `"else" without matching "if" or "select"`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }
  if (top.elseSeen) {
    diag(diagnostics, filePath, `"else" duplicated in if`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }
  top.elseSeen = true;
  return { kind: 'Else', span: stmtSpan };
}

function parseEndStatement(trimmed: string, ctx: ParseAsmStatementContext): ParsedAsmStatement {
  const { filePath, stmtSpan, diagnostics, controlStack } = ctx;
  if (!isBareAsmControlKeyword(trimmed, 'end')) {
    diag(diagnostics, filePath, `"end" does not take operands`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }

  const top = controlStack.pop();
  if (!top) {
    diag(diagnostics, filePath, `Unexpected "end" in asm block`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }
  if (top.kind === 'Repeat') {
    diag(diagnostics, filePath, `"repeat" blocks must close with "until <cc>"`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }
  if (top.kind === 'Select' && !top.armSeen && !top.recoverOnly) {
    diag(diagnostics, filePath, `"select" must contain at least one arm ("case" or "else")`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }
  return { kind: 'End', span: stmtSpan };
}

function parseIfStatement(trimmed: string, ctx: ParseAsmStatementContext): ParsedAsmStatement {
  const { filePath, stmtSpan, diagnostics, controlStack, options } = ctx;
  const missingCc = '__missing__';
  const parsed = parseAsmConditionKeyword(trimmed, 'if');
  if (parsed.kind === 'value') {
    const cc = parseConditionCode(filePath, 'if', parsed.value, stmtSpan, diagnostics, options);
    controlStack.push({ kind: 'If', elseSeen: false, openSpan: stmtSpan });
    return { kind: 'If', span: stmtSpan, cc };
  }

  diag(diagnostics, filePath, `"if" expects a condition code`, {
    line: stmtSpan.start.line,
    column: stmtSpan.start.column,
  });
  controlStack.push({
    kind: 'If',
    elseSeen: false,
    openSpan: stmtSpan,
    ...(parsed.kind === 'invalid' ? { recoverOnly: true } : {}),
  });
  return { kind: 'If', span: stmtSpan, cc: missingCc };
}

function parseWhileStatement(trimmed: string, ctx: ParseAsmStatementContext): ParsedAsmStatement {
  const { filePath, stmtSpan, diagnostics, controlStack, options } = ctx;
  const missingCc = '__missing__';
  const parsed = parseAsmConditionKeyword(trimmed, 'while');
  if (parsed.kind === 'value') {
    const cc = parseConditionCode(filePath, 'while', parsed.value, stmtSpan, diagnostics, options);
    controlStack.push({ kind: 'While', openSpan: stmtSpan });
    return { kind: 'While', span: stmtSpan, cc };
  }

  diag(diagnostics, filePath, `"while" expects a condition code`, {
    line: stmtSpan.start.line,
    column: stmtSpan.start.column,
  });
  controlStack.push({
    kind: 'While',
    openSpan: stmtSpan,
    ...(parsed.kind === 'invalid' ? { recoverOnly: true } : {}),
  });
  return { kind: 'While', span: stmtSpan, cc: missingCc };
}

function parseUntilStatement(trimmed: string, ctx: ParseAsmStatementContext): ParsedAsmStatement {
  const { filePath, stmtSpan, diagnostics, controlStack, options } = ctx;
  const missingCc = '__missing__';
  const top = controlStack[controlStack.length - 1];
  if (top?.kind !== 'Repeat') {
    diag(diagnostics, filePath, `"until" without matching "repeat"`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }

  const parsed = parseAsmConditionKeyword(trimmed, 'until');
  if (parsed.kind === 'missing') {
    diag(diagnostics, filePath, `"until" expects a condition code`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    controlStack.pop();
    return { kind: 'Until', span: stmtSpan, cc: missingCc };
  }

  if (parsed.kind === 'value') {
    const cc = parseConditionCode(filePath, 'until', parsed.value, stmtSpan, diagnostics, options);
    controlStack.pop();
    return { kind: 'Until', span: stmtSpan, cc };
  }

  diag(diagnostics, filePath, `"until" expects a condition code`, {
    line: stmtSpan.start.line,
    column: stmtSpan.start.column,
  });
  controlStack.pop();
  return { kind: 'Until', span: stmtSpan, cc: missingCc };
}

function parseSelectStatement(trimmed: string, ctx: ParseAsmStatementContext): ParsedAsmStatement {
  const { filePath, stmtSpan, diagnostics, controlStack } = ctx;
  const fallbackNode = {
    kind: 'Select' as const,
    span: stmtSpan,
    selector: { kind: 'Imm' as const, span: stmtSpan, expr: immLiteral(filePath, stmtSpan, 0) },
  };

  const parsed = parseSelectOperandFromText(filePath, trimmed, stmtSpan, diagnostics);
  if (parsed.kind === 'missing') {
    diag(diagnostics, filePath, `"select" expects a selector`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    controlStack.push({ kind: 'Select', elseSeen: false, armSeen: false, openSpan: stmtSpan });
    return fallbackNode;
  }

  if (parsed.kind === 'value') {
    controlStack.push({ kind: 'Select', elseSeen: false, armSeen: false, openSpan: stmtSpan });
    return { kind: 'Select', span: stmtSpan, selector: parsed.value };
  }

  diag(diagnostics, filePath, `Invalid select selector`, {
    line: stmtSpan.start.line,
    column: stmtSpan.start.column,
  });
  controlStack.push({
    kind: 'Select',
    elseSeen: false,
    armSeen: false,
    openSpan: stmtSpan,
    recoverOnly: true,
  });
  return fallbackNode;
}

function parseCaseStatement(trimmed: string, ctx: ParseAsmStatementContext): ParsedAsmStatement {
  const { filePath, stmtSpan, diagnostics, controlStack } = ctx;
  const top = controlStack[controlStack.length - 1];
  if (top?.kind !== 'Select') {
    diag(diagnostics, filePath, `"case" without matching "select"`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }
  if (top.elseSeen) {
    diag(diagnostics, filePath, `"case" after "else" in select`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }
  top.armSeen = true;

  const parsed = parseAsmKeywordTail(trimmed, 'case');
  if (parsed.kind === 'missing') {
    diag(diagnostics, filePath, `"case" expects a value`, {
      line: stmtSpan.start.line,
      column: stmtSpan.start.column,
    });
    return undefined;
  }

  if (parsed.kind === 'value') {
    const values = parseCaseValuesFromText(filePath, parsed.value, stmtSpan, diagnostics);
    if (!values) {
      diag(diagnostics, filePath, `Invalid case value`, {
        line: stmtSpan.start.line,
        column: stmtSpan.start.column,
      });
      return undefined;
    }
    return values.map((value) => ({ kind: 'Case', span: stmtSpan, ...value }));
  }

  diag(diagnostics, filePath, `Invalid case value`, {
    line: stmtSpan.start.line,
    column: stmtSpan.start.column,
  });
  return undefined;
}

export function parseAsmStatement(
  filePath: string,
  text: string,
  stmtSpan: SourceSpan,
  diagnostics: Diagnostic[],
  controlStack: AsmControlFrame[],
  options?: ParseAsmStatementOptions,
): ParsedAsmStatement {
  const trimmed = text.trim();
  const ctx: ParseAsmStatementContext = {
    filePath,
    stmtSpan,
    diagnostics,
    controlStack,
    ...(options ? { options } : {}),
  };
  switch (firstAsmControlKeyword(trimmed)) {
    case 'repeat':
      return parseRepeatStatement(trimmed, ctx);
    case 'else':
      return parseElseStatement(trimmed, ctx);
    case 'end':
      return parseEndStatement(trimmed, ctx);
    case 'if':
      return parseIfStatement(trimmed, ctx);
    case 'while':
      return parseWhileStatement(trimmed, ctx);
    case 'until':
      return parseUntilStatement(trimmed, ctx);
    case 'break':
      return parseLoopEscapeStatement(trimmed, 'break', ctx);
    case 'continue':
      return parseLoopEscapeStatement(trimmed, 'continue', ctx);
    case 'select':
      return parseSelectStatement(trimmed, ctx);
    case 'case':
      return parseCaseStatement(trimmed, ctx);
  }

  return parseAsmInstruction(filePath, trimmed, stmtSpan, diagnostics);
}
