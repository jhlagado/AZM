import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { SourceItem } from '../model/source-item.js';
import type {
  Z80AluMnemonic,
  Z80Instruction,
  Z80Operand,
  Z80Register16,
  Z80Register8,
} from '../z80/instruction.js';
import { encodeZ80Instruction } from '../z80/encode.js';
import { parseZ80Instruction } from '../z80/parse-instruction.js';
import { parseLogicalLine, type ParseLogicalLineOptions } from '../syntax/parse-line.js';
import { parseExpression } from '../syntax/parse-expression.js';

type LogicalLineLike = {
  readonly sourceName: string;
  readonly line: number;
  readonly text: string;
};

type OpMatcher =
  | { readonly kind: 'reg8' }
  | { readonly kind: 'reg16' }
  | { readonly kind: 'imm8' }
  | { readonly kind: 'imm16' }
  | { readonly kind: 'cc' }
  | { readonly kind: 'idx16' }
  | { readonly kind: 'ea' }
  | { readonly kind: 'mem8' }
  | { readonly kind: 'mem16' }
  | { readonly kind: 'fixed'; readonly token: string };

interface OpParam {
  readonly name: string;
  readonly matcher: OpMatcher;
}

type OpOperand =
  | { readonly kind: 'reg8'; readonly register: string; readonly text: string }
  | { readonly kind: 'reg16'; readonly register: string; readonly text: string }
  | { readonly kind: 'reg-indirect'; readonly register: 'hl'; readonly text: string }
  | { readonly kind: 'mem-abs'; readonly expression: Expression; readonly text: string }
  | {
      readonly kind: 'indexed';
      readonly register: 'ix' | 'iy';
      readonly displacement: Expression;
      readonly text: string;
    }
  | { readonly kind: 'imm'; readonly expression: Expression; readonly text: string };

type OpTemplateOperand =
  | { readonly kind: 'param'; readonly name: string }
  | { readonly kind: 'port-param'; readonly name: string }
  | { readonly kind: 'literal'; readonly operand: OpOperand };

type OpTemplateItem =
  | { readonly kind: 'source-items'; readonly items: readonly SourceItem[] }
  | {
      readonly kind: 'instruction';
      readonly mnemonic: string;
      readonly operands: readonly OpTemplateOperand[];
    };

interface OpDecl {
  readonly name: string;
  readonly params: readonly OpParam[];
  readonly body: readonly OpTemplateItem[];
  readonly sourceName: string;
  readonly line: number;
}

export function collectOps(
  lines: readonly LogicalLineLike[],
  diagnostics: Diagnostic[],
  parseOptions: ParseLogicalLineOptions = {},
): {
  readonly ops: ReadonlyMap<string, readonly OpDecl[]>;
  readonly opLineIndexes: ReadonlySet<number>;
} {
  const ops = new Map<string, OpDecl[]>();
  const opLineIndexes = new Set<number>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (isTopLevelEnd(line.text)) {
      break;
    }
    const opHeader = /^op\s+([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/i.exec(
      stripComment(line.text).trim(),
    );
    if (!opHeader) {
      continue;
    }

    const name = opHeader[1] ?? '';
    const params = parseOpParams(opHeader[2] ?? '', line, diagnostics);
    const paramNames = new Set(params.map((param) => param.name));
    const body: OpTemplateItem[] = [];
    let terminated = false;
    opLineIndexes.add(index);

    for (index += 1; index < lines.length; index += 1) {
      opLineIndexes.add(index);
      const bodyLine = lines[index]!;
      const bodyText = stripComment(bodyLine.text).trim();
      if (/^end\s*$/i.test(bodyText)) {
        terminated = true;
        break;
      }
      const template = parseOpBodyTemplate(bodyLine, paramNames, diagnostics, parseOptions);
      if (template) {
        body.push(template);
      }
    }

    if (!terminated) {
      diagnostics.push(parseDiagnostic(line, `op ${name} missing end`));
    }
    if (params.length > 0 || terminated) {
      const overloads = ops.get(name) ?? [];
      overloads.push({ name, params, body, sourceName: line.sourceName, line: line.line });
      ops.set(name, overloads);
    }
  }

  return { ops, opLineIndexes };
}

export function parseOpInvocation(
  line: LogicalLineLike,
): { readonly name: string; readonly operands: readonly OpOperand[] } | undefined {
  const text = stripComment(line.text).trim();
  const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(.+))?$/.exec(text);
  if (!match) {
    return undefined;
  }
  const operandText = match[2] ?? '';
  const parts = operandText.trim().length === 0 ? [] : splitOperands(operandText);
  const operands = parts.map((operand) => parseOpOperand(operand));
  if (operands.some((operand) => operand === undefined)) {
    return undefined;
  }
  return { name: match[1] ?? '', operands: operands as OpOperand[] };
}

export function expandOpInvocation(
  ops: ReadonlyMap<string, readonly OpDecl[]>,
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
  line: LogicalLineLike,
  diagnostics: Diagnostic[],
): readonly SourceItem[] {
  return expandSelectedOp(ops, overloads, operands, line, diagnostics, []);
}

function expandSelectedOp(
  ops: ReadonlyMap<string, readonly OpDecl[]>,
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
  line: LogicalLineLike,
  diagnostics: Diagnostic[],
  stack: readonly OpDecl[],
): readonly SourceItem[] {
  const name = overloads[0]?.name ?? '<unknown>';
  const cycleStart = stack.findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (cycleStart !== -1) {
    diagnostics.push(
      parseDiagnostic(
        line,
        [
          `Cyclic op expansion detected for "${name}".`,
          `expansion chain: ${[...stack.slice(cycleStart), overloads[0]!].map(formatOpChainEntry).join(' -> ')}`,
        ].join('\n'),
      ),
    );
    return [];
  }

  const selection = selectOpOverload(overloads, operands);
  if (selection.kind !== 'selected') {
    diagnostics.push(
      parseDiagnostic(line, formatOpSelectionDiagnostic(selection, overloads, operands)),
    );
    return [];
  }

  const bindings = new Map<string, OpOperand>();
  selection.overload.params.forEach((param, index) => {
    bindings.set(param.name, operands[index]!);
  });

  const expanded: SourceItem[] = [];
  const localLabelMap = buildLocalLabelMap(selection.overload, line);
  const expansionStack = [...stack, selection.overload];
  const emittedSource = {
    span: { sourceName: line.sourceName, line: line.line, column: firstColumn(line.text) },
    kind: 'macro' as const,
  };
  for (const item of selection.overload.body) {
    if (item.kind === 'source-items') {
      expanded.push(
        ...renameSourceItems(item.items, localLabelMap).map((renamed) =>
          stampOpSource(renamed, emittedSource),
        ),
      );
      continue;
    }
    const concreteOperands = instantiateTemplateOperands(item, bindings);
    if (!concreteOperands) {
      diagnostics.push(
        parseDiagnostic(line, `invalid op expansion in "${selection.overload.name}"`),
      );
      continue;
    }
    const nested = ops.get(item.mnemonic);
    if (nested) {
      expanded.push(
        ...expandSelectedOp(ops, nested, concreteOperands, line, diagnostics, expansionStack),
      );
      continue;
    }
    const instruction = instantiateTemplateInstruction(item, concreteOperands);
    if (!instruction || encodeZ80Instruction(instruction).size === 0) {
      reportInvalidOpExpansion(
        line,
        diagnostics,
        selection.overload,
        expansionStack,
        item,
        concreteOperands,
      );
      continue;
    }
    expanded.push({
      kind: 'instruction',
      instruction: renameInstructionExpressions(instruction, localLabelMap),
      span: emittedSource.span,
      emittedSource,
    });
  }
  return expanded;
}

function stampOpSource(
  item: SourceItem,
  emittedSource: NonNullable<Extract<SourceItem, { kind: 'instruction' }>['emittedSource']>,
): SourceItem {
  if (item.kind !== 'instruction') return item;
  return { ...item, emittedSource };
}

function parseOpParams(text: string, line: LogicalLineLike, diagnostics: Diagnostic[]): OpParam[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const parts = splitOperands(trimmed);
  if (parts.some((part) => part.trim().length === 0)) {
    diagnostics.push(
      parseDiagnostic(
        line,
        'Invalid op parameter list: trailing or empty entries are not permitted.',
      ),
    );
    return [];
  }
  const params: OpParam[] = [];
  for (const part of parts) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z][A-Za-z0-9_]*)$/.exec(part.trim());
    if (!match) {
      diagnostics.push(
        parseDiagnostic(
          line,
          'Invalid op parameter list: trailing or empty entries are not permitted.',
        ),
      );
      continue;
    }
    const matcherText = match[2] ?? '';
    const matcher = parseOpMatcher(matcherText);
    if (!matcher) {
      diagnostics.push(parseDiagnostic(line, `unsupported op matcher: ${matcherText}`));
      continue;
    }
    params.push({ name: match[1] ?? '', matcher });
  }
  return params;
}

function parseOpMatcher(text: string): OpMatcher | undefined {
  if (/^reg8$/i.test(text)) {
    return { kind: 'reg8' };
  }
  if (/^reg16$/i.test(text)) {
    return { kind: 'reg16' };
  }
  if (/^imm8$/i.test(text)) {
    return { kind: 'imm8' };
  }
  if (/^imm16$/i.test(text)) {
    return { kind: 'imm16' };
  }
  if (/^cc$/i.test(text)) {
    return { kind: 'cc' };
  }
  if (/^idx16$/i.test(text)) {
    return { kind: 'idx16' };
  }
  if (/^ea$/i.test(text)) {
    return { kind: 'ea' };
  }
  if (/^mem8$/i.test(text)) {
    return { kind: 'mem8' };
  }
  if (/^mem16$/i.test(text)) {
    return { kind: 'mem16' };
  }
  if (/^[A-Za-z][A-Za-z0-9_]*$/.test(text)) {
    return { kind: 'fixed', token: text.toUpperCase() };
  }
  return undefined;
}

function parseOpBodyTemplate(
  line: LogicalLineLike,
  paramNames: ReadonlySet<string>,
  diagnostics: Diagnostic[],
  parseOptions: ParseLogicalLineOptions,
): OpTemplateItem | undefined {
  const text = stripComment(line.text).trim();
  if (text.length === 0) {
    return undefined;
  }
  const instruction = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(.+))?$/.exec(text);
  if (instruction) {
    const operandText = instruction[2] ?? '';
    const operands =
      operandText.trim().length === 0
        ? []
        : splitOperands(operandText).map((operand) => parseTemplateOperand(operand, paramNames));
    if (operands.every((operand) => operand !== undefined)) {
      if (
        !operands.some((operand) => operand?.kind === 'param' || operand?.kind === 'port-param')
      ) {
        const result = parseLogicalLine(line, parseOptions);
        if (result.items.length > 0 || !isUnsupportedSourceLine(result.diagnostics)) {
          diagnostics.push(...result.diagnostics);
          return result.items.length > 0
            ? { kind: 'source-items', items: result.items }
            : undefined;
        }
      }
      return {
        kind: 'instruction',
        mnemonic: (instruction[1] ?? '').toLowerCase(),
        operands: operands as OpTemplateOperand[],
      };
    }
  }
  const result = parseLogicalLine(line, parseOptions);
  diagnostics.push(...result.diagnostics);
  return result.items.length > 0 ? { kind: 'source-items', items: result.items } : undefined;
}

function isUnsupportedSourceLine(diagnostics: readonly Diagnostic[]): boolean {
  return (
    diagnostics.length === 1 &&
    diagnostics[0]?.code === 'AZMN_PARSE' &&
    diagnostics[0].message.startsWith('unsupported source line:')
  );
}

function parseTemplateOperand(
  text: string,
  paramNames: ReadonlySet<string>,
): OpTemplateOperand | undefined {
  const trimmed = text.trim();
  if (paramNames.has(trimmed)) {
    return { kind: 'param', name: trimmed };
  }
  const portParam = /^\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/.exec(trimmed);
  if (portParam && paramNames.has(portParam[1] ?? '')) {
    return { kind: 'port-param', name: portParam[1] ?? '' };
  }
  const operand = parseOpOperand(trimmed);
  return operand ? { kind: 'literal', operand } : undefined;
}

function parseOpOperand(text: string): OpOperand | undefined {
  const trimmed = text.trim();
  if (/^(A|B|C|D|E|H|L)$/i.test(trimmed)) {
    return { kind: 'reg8', register: trimmed.toLowerCase(), text: trimmed.toUpperCase() };
  }
  if (/^(BC|DE|HL|SP)$/i.test(trimmed)) {
    return { kind: 'reg16', register: trimmed.toLowerCase(), text: trimmed.toUpperCase() };
  }
  if (/^\(HL\)$/i.test(trimmed)) {
    return { kind: 'reg-indirect', register: 'hl', text: '(HL)' };
  }
  const indexed = parseIndexedOperand(trimmed);
  if (indexed) {
    return indexed;
  }
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const expression = parseExpression(trimmed.slice(1, -1).trim());
    return expression ? { kind: 'mem-abs', expression, text: trimmed } : undefined;
  }
  const expression = parseExpression(trimmed);
  return expression ? { kind: 'imm', expression, text: trimmed } : undefined;
}

type OpSelection =
  | { readonly kind: 'selected'; readonly overload: OpDecl }
  | { readonly kind: 'arity_mismatch' }
  | { readonly kind: 'no_match'; readonly candidates: readonly OpDecl[] }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly OpDecl[] };

function selectOpOverload(
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
): OpSelection {
  const arityMatches = overloads.filter((overload) => overload.params.length === operands.length);
  if (arityMatches.length === 0) {
    return { kind: 'arity_mismatch' };
  }
  const matches = arityMatches.filter((overload) =>
    overload.params.every((param, index) => matcherMatchesOperand(param.matcher, operands[index]!)),
  );
  if (matches.length === 0) {
    return { kind: 'no_match', candidates: arityMatches };
  }
  if (matches.length === 1) {
    return { kind: 'selected', overload: matches[0]! };
  }
  const selected = mostSpecificOverload(matches, operands);
  return selected
    ? { kind: 'selected', overload: selected }
    : { kind: 'ambiguous', candidates: matches };
}

function mostSpecificOverload(
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
): OpDecl | undefined {
  for (const candidate of overloads) {
    let beatsAll = true;
    for (const other of overloads) {
      if (candidate === other) {
        continue;
      }
      if (compareOverloadSpecificity(candidate, other, operands) !== 'x') {
        beatsAll = false;
        break;
      }
    }
    if (beatsAll) {
      return candidate;
    }
  }
  return undefined;
}

function compareOverloadSpecificity(
  x: OpDecl,
  y: OpDecl,
  operands: readonly OpOperand[],
): 'x' | 'y' | 'equal' | 'incomparable' {
  let xBetter = 0;
  let yBetter = 0;
  for (let index = 0; index < operands.length; index += 1) {
    const comparison = compareMatcherSpecificity(
      x.params[index]!.matcher,
      y.params[index]!.matcher,
      operands[index]!,
    );
    if (comparison === 'x') {
      xBetter += 1;
    } else if (comparison === 'y') {
      yBetter += 1;
    }
  }
  if (xBetter > 0 && yBetter === 0) return 'x';
  if (yBetter > 0 && xBetter === 0) return 'y';
  if (xBetter === 0 && yBetter === 0) return 'equal';
  return 'incomparable';
}

function compareMatcherSpecificity(
  x: OpMatcher,
  y: OpMatcher,
  operand: OpOperand,
): 'x' | 'y' | 'equal' {
  if (x.kind === y.kind) return 'equal';
  if (x.kind === 'fixed' && fixedTokenBeatsMatcher(x, y, operand)) return 'x';
  if (y.kind === 'fixed' && fixedTokenBeatsMatcher(y, x, operand)) return 'y';
  if (x.kind === 'imm8' && y.kind === 'imm16' && operand.kind === 'imm') {
    return expressionFitsKnownImm8(operand.expression) ? 'x' : 'equal';
  }
  if (x.kind === 'imm16' && y.kind === 'imm8' && operand.kind === 'imm') {
    return expressionFitsKnownImm8(operand.expression) ? 'y' : 'equal';
  }
  return 'equal';
}

function fixedTokenBeatsMatcher(
  fixed: Extract<OpMatcher, { readonly kind: 'fixed' }>,
  other: OpMatcher,
  operand: OpOperand,
): boolean {
  return (
    (other.kind === 'reg8' && operand.kind === 'reg8' && operand.text === fixed.token) ||
    (other.kind === 'reg16' && operand.kind === 'reg16' && operand.text === fixed.token) ||
    (other.kind === 'cc' &&
      isConditionToken(fixed.token) &&
      operand.text.toUpperCase() === fixed.token)
  );
}

function matcherMatchesOperand(matcher: OpMatcher, operand: OpOperand): boolean {
  switch (matcher.kind) {
    case 'reg8':
      return operand.kind === 'reg8';
    case 'reg16':
      return operand.kind === 'reg16';
    case 'imm8':
      return operand.kind === 'imm' && expressionFitsKnownImm8(operand.expression);
    case 'imm16':
      return operand.kind === 'imm' && expressionFitsKnownImm16(operand.expression);
    case 'cc':
      return isConditionToken(operand.text);
    case 'idx16':
      return operand.kind === 'indexed';
    case 'ea':
      return operand.kind === 'imm';
    case 'mem8':
    case 'mem16':
      return (
        operand.kind === 'reg-indirect' || operand.kind === 'mem-abs' || operand.kind === 'indexed'
      );
    case 'fixed':
      return operand.text.toUpperCase() === matcher.token;
  }
}

function formatOpSelectionDiagnostic(
  selection: Exclude<OpSelection, { readonly kind: 'selected' }>,
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
): string {
  const name = overloads[0]?.name ?? '<unknown>';
  const operandSummary = `call-site operands: (${operands.map(formatOpOperand).join(', ')})`;
  switch (selection.kind) {
    case 'arity_mismatch':
      return [
        `No op overload of "${name}" accepts ${operands.length} operand(s).`,
        'available overloads:',
        ...overloads.map((overload) => `  - ${formatOpSignature(overload)}`),
      ].join('\n');
    case 'no_match': {
      return [
        `No matching op overload for "${name}" with provided operands.`,
        operandSummary,
        'available overloads:',
        ...selection.candidates.map((candidate) => {
          const mismatch = firstMismatchReason(candidate, operands);
          return `  - ${formatOpSignatureWithLocation(candidate)}${mismatch ? ` ; ${mismatch}` : ''}`;
        }),
      ].join('\n');
    }
    case 'ambiguous':
      return [
        `Ambiguous op overload for "${name}" (${selection.candidates.length} matches).`,
        operandSummary,
        'equally specific candidates:',
        ...selection.candidates.map(
          (candidate) => `  - ${formatOpSignatureWithLocation(candidate)}`,
        ),
      ].join('\n');
  }
}

function firstMismatchReason(overload: OpDecl, operands: readonly OpOperand[]): string | undefined {
  for (let index = 0; index < overload.params.length; index += 1) {
    const param = overload.params[index]!;
    const operand = operands[index]!;
    if (!matcherMatchesOperand(param.matcher, operand)) {
      return `${param.name}: ${matcherMismatchReason(param.matcher, operand)}`;
    }
  }
  return undefined;
}

function matcherMismatchReason(matcher: OpMatcher, operand: OpOperand): string {
  switch (matcher.kind) {
    case 'reg8':
      return `expects reg8, got ${formatOpOperand(operand)}`;
    case 'reg16':
      return `expects reg16, got ${formatOpOperand(operand)}`;
    case 'imm8':
      return `expects imm8, got ${formatOpOperand(operand)}`;
    case 'imm16':
      return `expects imm16, got ${formatOpOperand(operand)}`;
    case 'cc':
      return `expects condition token NZ/Z/NC/C/PO/PE/P/M, got ${formatOpOperand(operand)}`;
    case 'idx16':
      return `expects IX/IY indexed memory operand, got ${formatOpOperand(operand)}`;
    case 'ea':
      return `expects ea, got ${formatOpOperand(operand)}`;
    case 'mem8':
      return `expects mem8 dereference, got ${formatOpOperand(operand)}`;
    case 'mem16':
      return `expects mem16 dereference, got ${formatOpOperand(operand)}`;
    case 'fixed':
      return `expects ${matcher.token}, got ${formatOpOperand(operand)}`;
  }
}

function formatOpSignature(op: OpDecl): string {
  return `${op.name}(${op.params.map((param) => `${param.name} ${formatMatcher(param.matcher)}`).join(', ')})`;
}

function formatOpSignatureWithLocation(op: OpDecl): string {
  return `${formatOpSignature(op)} (${op.sourceName}:${op.line})`;
}

function formatOpChainEntry(op: OpDecl): string {
  return `${op.name} (${op.sourceName}:${op.line})`;
}

function formatMatcher(matcher: OpMatcher): string {
  return matcher.kind === 'fixed' ? matcher.token : matcher.kind;
}

function formatOpOperand(operand: OpOperand): string {
  return operand.kind === 'imm' ? operand.text : operand.text.toUpperCase();
}

function formatExpandedInstruction(mnemonic: string, operands: readonly OpOperand[]): string {
  return `${mnemonic} ${operands.map(formatOpOperand).join(', ')}`.trim();
}

function reportInvalidOpExpansion(
  line: LogicalLineLike,
  diagnostics: Diagnostic[],
  overload: OpDecl,
  expansionStack: readonly OpDecl[],
  item: Extract<OpTemplateItem, { readonly kind: 'instruction' }>,
  concreteOperands: readonly OpOperand[],
): void {
  const expandedInstruction = formatExpandedInstruction(item.mnemonic, concreteOperands);
  const underlying = expandedInstructionUnderlyingError(item, concreteOperands);
  if (underlying) {
    diagnostics.push(parseDiagnostic(line, underlying));
  }
  diagnostics.push(
    parseDiagnostic(
      line,
      formatInvalidOpExpansionDiagnostic(overload, expandedInstruction, expansionStack),
    ),
  );
}

function expandedInstructionUnderlyingError(
  item: Extract<OpTemplateItem, { readonly kind: 'instruction' }>,
  concreteOperands: readonly OpOperand[],
): string | undefined {
  const instruction = instantiateTemplateInstruction(item, concreteOperands);
  if (instruction && encodeZ80Instruction(instruction).size > 0) {
    return undefined;
  }
  if (instruction?.mnemonic === 'ld' || item.mnemonic === 'ld') {
    return 'ld expects a supported register/memory/immediate transfer form';
  }
  const parsed = parseZ80Instruction(formatExpandedInstruction(item.mnemonic, concreteOperands));
  return parsed?.error;
}

function formatInvalidOpExpansionDiagnostic(
  overload: OpDecl,
  expandedInstruction: string,
  expansionStack: readonly OpDecl[],
): string {
  return [
    `Invalid op expansion in "${overload.name}" at call site.`,
    `expanded instruction: ${expandedInstruction}`,
    `op definition: ${overload.sourceName}:${overload.line}`,
    `expansion chain: ${expansionStack.map(formatOpChainEntry).join(' -> ')}`,
  ].join('\n');
}

function instantiateTemplateInstruction(
  item: Extract<OpTemplateItem, { readonly kind: 'instruction' }>,
  concrete: readonly OpOperand[],
): Z80Instruction | undefined {
  const mnemonic = item.mnemonic;
  if (mnemonic === 'ld' && concrete.length === 2) {
    const target = toZ80Operand(concrete[0]!);
    const source = toZ80Operand(concrete[1]!);
    return target && source ? { mnemonic: 'ld', target, source } : undefined;
  }
  if (mnemonic === 'in' && concrete.length === 2 && concrete[0]?.kind === 'reg8') {
    const port = toPortOperand(concrete[1]!);
    return port
      ? {
          mnemonic: 'in',
          target: { kind: 'reg8', register: concrete[0].register as Z80Register8 },
          port,
        }
      : undefined;
  }
  if (mnemonic === 'out' && concrete.length === 2) {
    const port = toPortOperand(concrete[0]!);
    const source = concrete[1]?.kind === 'reg8' ? concrete[1] : undefined;
    return port && source
      ? {
          mnemonic: 'out',
          port,
          source: { kind: 'reg8', register: source.register as Z80Register8 },
        }
      : undefined;
  }
  if ((mnemonic === 'inc' || mnemonic === 'dec') && concrete.length === 1) {
    const operand = toIncDecOperand(concrete[0]!);
    return operand ? { mnemonic, operand } : undefined;
  }
  if (mnemonic === 'jp' && concrete.length === 1 && concrete[0]?.kind === 'imm') {
    return { mnemonic: 'jp', expression: concrete[0].expression };
  }
  if (
    mnemonic === 'jp' &&
    concrete.length === 2 &&
    isConditionToken(concrete[0]?.text ?? '') &&
    concrete[1]?.kind === 'imm'
  ) {
    return {
      mnemonic: 'jp-cc',
      condition: concrete[0]!.text.toLowerCase() as Extract<
        Z80Instruction,
        { readonly mnemonic: 'jp-cc' }
      >['condition'],
      expression: concrete[1].expression,
    };
  }
  if (mnemonic === 'jr' && concrete.length === 1 && concrete[0]?.kind === 'imm') {
    return { mnemonic: 'jr', expression: concrete[0].expression };
  }
  if (
    mnemonic === 'jr' &&
    concrete.length === 2 &&
    isRelativeConditionToken(concrete[0]?.text ?? '') &&
    concrete[1]?.kind === 'imm'
  ) {
    return {
      mnemonic: 'jr-cc',
      condition: concrete[0]!.text.toLowerCase() as Extract<
        Z80Instruction,
        { readonly mnemonic: 'jr-cc' }
      >['condition'],
      expression: concrete[1].expression,
    };
  }
  if (isAluMnemonic(mnemonic) && concrete.length === 1) {
    const source = toZ80Operand(concrete[0]!);
    return source ? { mnemonic, source } : undefined;
  }
  if (isAluMnemonic(mnemonic) && concrete.length === 2 && concrete[0]?.kind === 'reg8') {
    if (concrete[0].register !== 'a') {
      return undefined;
    }
    const source = toZ80Operand(concrete[1]!);
    return source ? { mnemonic, source } : undefined;
  }
  if (
    (mnemonic === 'add' || mnemonic === 'adc' || mnemonic === 'sbc') &&
    concrete.length === 2 &&
    concrete[0]?.kind === 'reg16' &&
    concrete[1]?.kind === 'reg16'
  ) {
    const target = toZ80Operand(concrete[0]);
    const source = toZ80Operand(concrete[1]);
    return target?.kind === 'reg16' && source?.kind === 'reg16'
      ? { mnemonic, target, source }
      : undefined;
  }
  return parseExpandedInstruction(mnemonic, concrete);
}

function instantiateTemplateOperands(
  item: Extract<OpTemplateItem, { readonly kind: 'instruction' }>,
  bindings: ReadonlyMap<string, OpOperand>,
): readonly OpOperand[] | undefined {
  const operands = item.operands.map((operand) =>
    operand.kind === 'param'
      ? bindings.get(operand.name)
      : operand.kind === 'port-param'
        ? parenthesizedOperandFromBinding(item.mnemonic, bindings.get(operand.name))
        : operand.operand,
  );
  if (operands.some((operand) => operand === undefined)) {
    return undefined;
  }
  return operands as OpOperand[];
}

function toZ80Operand(operand: OpOperand): Z80Operand | undefined {
  switch (operand.kind) {
    case 'reg8':
      return { kind: 'reg8', register: operand.register as Z80Register8 };
    case 'reg16':
      return { kind: 'reg16', register: operand.register as Z80Register16 };
    case 'reg-indirect':
      return { kind: 'reg-indirect', register: operand.register };
    case 'mem-abs':
      return { kind: 'mem-abs', expression: operand.expression };
    case 'indexed':
      return {
        kind: 'indexed',
        register: operand.register,
        displacement: operand.displacement,
      };
    case 'imm':
      return { kind: 'imm', expression: operand.expression };
  }
}

function toPortOperand(
  operand: OpOperand,
): { readonly kind: 'c' } | { readonly kind: 'imm'; readonly expression: Expression } | undefined {
  if (operand.kind === 'reg8' && operand.register === 'c') {
    return { kind: 'c' };
  }
  return operand.kind === 'imm' ? { kind: 'imm', expression: operand.expression } : undefined;
}

function toIncDecOperand(
  operand: OpOperand,
): Extract<Z80Instruction, { readonly mnemonic: 'inc' | 'dec' }>['operand'] | undefined {
  switch (operand.kind) {
    case 'reg8':
      return { kind: 'reg8', register: operand.register as Z80Register8 };
    case 'reg16':
      return { kind: 'reg16', register: operand.register as Z80Register16 };
    case 'reg-indirect':
      return { kind: 'reg-indirect', register: operand.register };
    case 'indexed':
      return {
        kind: 'indexed',
        register: operand.register,
        displacement: operand.displacement,
      };
    case 'imm':
      return undefined;
  }
}

function parenthesizedOperandFromBinding(
  mnemonic: string,
  operand: OpOperand | undefined,
): OpOperand | undefined {
  if (operand?.kind !== 'imm') {
    return undefined;
  }
  return mnemonic === 'in' || mnemonic === 'out'
    ? operand
    : { kind: 'mem-abs', expression: operand.expression, text: `(${operand.text})` };
}

function buildLocalLabelMap(op: OpDecl, line: LogicalLineLike): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  let ordinal = 0;
  for (const item of op.body) {
    if (item.kind !== 'source-items') {
      continue;
    }
    for (const sourceItem of item.items) {
      if (sourceItem.kind === 'label' && !map.has(sourceItem.name)) {
        map.set(sourceItem.name, `__azm_op_${op.name}_${sourceItem.name}_${line.line}_${ordinal}`);
        ordinal += 1;
      }
    }
  }
  return map;
}

function renameSourceItems(
  items: readonly SourceItem[],
  localLabelMap: ReadonlyMap<string, string>,
): readonly SourceItem[] {
  if (localLabelMap.size === 0) {
    return items;
  }
  return items.map((item) => renameSourceItem(item, localLabelMap));
}

function renameSourceItem(
  item: SourceItem,
  localLabelMap: ReadonlyMap<string, string>,
): SourceItem {
  switch (item.kind) {
    case 'label':
      return { ...item, name: localLabelMap.get(item.name) ?? item.name };
    case 'org':
    case 'binfrom':
    case 'binto':
      return { ...item, expression: renameExpression(item.expression, localLabelMap) };
    case 'equ':
      return { ...item, expression: renameExpression(item.expression, localLabelMap) };
    case 'db':
      return {
        ...item,
        values: item.values.map((value) =>
          value.kind === 'string-fragment' ? value : renameExpression(value, localLabelMap),
        ),
      };
    case 'dw':
      return {
        ...item,
        values: item.values.map((value) => renameExpression(value, localLabelMap)),
      };
    case 'ds':
      return item.fill
        ? {
            ...item,
            size: renameExpression(item.size, localLabelMap),
            fill: renameExpression(item.fill, localLabelMap),
          }
        : { ...item, size: renameExpression(item.size, localLabelMap) };
    case 'align':
      return { ...item, alignment: renameExpression(item.alignment, localLabelMap) };
    case 'instruction':
      return {
        ...item,
        instruction: renameInstructionExpressions(item.instruction, localLabelMap),
      };
    case 'end':
    case 'enum':
    case 'type':
    case 'string-data':
      return item;
  }
}

function renameInstructionExpressions(
  instruction: Z80Instruction,
  localLabelMap: ReadonlyMap<string, string>,
): Z80Instruction {
  if (localLabelMap.size === 0) {
    return instruction;
  }
  switch (instruction.mnemonic) {
    case 'ld':
      return {
        ...instruction,
        target: renameOperandExpression(instruction.target, localLabelMap),
        source: renameOperandExpression(instruction.source, localLabelMap),
      };
    case 'ld-a-imm':
      return {
        ...instruction,
        expression: renameExpression(instruction.expression, localLabelMap),
      };
    case 'in':
      return { ...instruction, port: renamePortExpression(instruction.port, localLabelMap) };
    case 'out':
      return { ...instruction, port: renamePortExpression(instruction.port, localLabelMap) };
    case 'add':
    case 'adc':
    case 'sub':
    case 'sbc':
      if ('target' in instruction) {
        return instruction;
      }
      return {
        ...instruction,
        source: renameOperandExpression(instruction.source, localLabelMap),
      };
    case 'and':
    case 'or':
    case 'xor':
    case 'cp':
      return { ...instruction, source: renameOperandExpression(instruction.source, localLabelMap) };
    case 'jp':
    case 'call':
    case 'jr':
    case 'djnz':
      return {
        ...instruction,
        expression: renameExpression(instruction.expression, localLabelMap),
      };
    case 'jp-cc':
    case 'call-cc':
    case 'jr-cc':
      return {
        ...instruction,
        expression: renameExpression(instruction.expression, localLabelMap),
      };
    default:
      return instruction;
  }
}

function renameOperandExpression(
  operand: Z80Operand,
  localLabelMap: ReadonlyMap<string, string>,
): Z80Operand {
  switch (operand.kind) {
    case 'imm':
      return { ...operand, expression: renameExpression(operand.expression, localLabelMap) };
    case 'mem-abs':
      return { ...operand, expression: renameExpression(operand.expression, localLabelMap) };
    case 'indexed':
      return { ...operand, displacement: renameExpression(operand.displacement, localLabelMap) };
    default:
      return operand;
  }
}

function renamePortExpression(
  port: Extract<Z80Instruction, { readonly mnemonic: 'in' | 'out' }>['port'],
  localLabelMap: ReadonlyMap<string, string>,
): Extract<Z80Instruction, { readonly mnemonic: 'in' | 'out' }>['port'] {
  return port.kind === 'imm'
    ? { ...port, expression: renameExpression(port.expression, localLabelMap) }
    : port;
}

function renameExpression(
  expression: Expression,
  localLabelMap: ReadonlyMap<string, string>,
): Expression {
  switch (expression.kind) {
    case 'symbol':
      return { ...expression, name: localLabelMap.get(expression.name) ?? expression.name };
    case 'unary':
      return { ...expression, expression: renameExpression(expression.expression, localLabelMap) };
    case 'binary':
      return {
        ...expression,
        left: renameExpression(expression.left, localLabelMap),
        right: renameExpression(expression.right, localLabelMap),
      };
    case 'layout-cast':
      return { ...expression, base: renameExpression(expression.base, localLabelMap) };
    default:
      return expression;
  }
}

function isAluMnemonic(mnemonic: string): mnemonic is Z80AluMnemonic {
  return /^(add|adc|sub|sbc|and|or|xor|cp)$/.test(mnemonic);
}

function expressionFitsKnownImm8(expression: Expression): boolean {
  const value = expressionConstantValue(expression);
  return value === undefined || (value >= -0x80 && value <= 0xff);
}

function expressionFitsKnownImm16(expression: Expression): boolean {
  const value = expressionConstantValue(expression);
  return value === undefined || (value >= -0x8000 && value <= 0xffff);
}

function parseIndexedOperand(text: string): OpOperand | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
    return undefined;
  }
  const inner = trimmed.slice(1, -1).trim();
  const match = /^(IX|IY)(?:\s*([+-])\s*(.+))?$/i.exec(inner);
  if (!match) {
    return undefined;
  }
  const displacementText = match[3] ?? '0';
  const displacement = parseExpression(
    match[2] === '-' ? `-${displacementText}` : displacementText,
  );
  return displacement
    ? {
        kind: 'indexed',
        register: (match[1] ?? '').toLowerCase() as 'ix' | 'iy',
        displacement,
        text: trimmed,
      }
    : undefined;
}

function isConditionToken(text: string): boolean {
  return /^(NZ|Z|NC|C|PO|PE|P|M)$/i.test(text);
}

function isRelativeConditionToken(text: string): boolean {
  return /^(NZ|Z|NC|C)$/i.test(text);
}

function parseExpandedInstruction(
  mnemonic: string,
  operands: readonly OpOperand[],
): Z80Instruction | undefined {
  const text = formatExpandedInstruction(mnemonic, operands);
  const result = parseLogicalLine({ sourceName: '<op-expansion>', line: 1, text });
  if (result.diagnostics.length > 0 || result.items.length !== 1) {
    return undefined;
  }
  const item = result.items[0];
  return item?.kind === 'instruction' ? item.instruction : undefined;
}

function expressionConstantValue(expression: Expression): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'unary': {
      const value = expressionConstantValue(expression.expression);
      if (value === undefined) return undefined;
      switch (expression.operator) {
        case '+':
          return value;
        case '-':
          return -value;
        case '~':
          return ~value;
      }
    }
    case 'binary': {
      const left = expressionConstantValue(expression.left);
      const right = expressionConstantValue(expression.right);
      if (left === undefined || right === undefined) return undefined;
      switch (expression.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return right === 0 ? undefined : Math.trunc(left / right);
        case '%':
          return right === 0 ? undefined : left % right;
        case '&':
          return left & right;
        case '^':
          return left ^ right;
        case '|':
          return left | right;
        case '<<':
          return left << right;
        case '>>':
          return left >> right;
      }
    }
    default:
      return undefined;
  }
}

function splitOperands(text: string): string[] {
  const values: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quote) {
      escaped = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = quote === char ? undefined : (quote ?? char);
      continue;
    }
    if (quote) {
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      values.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(text.slice(start).trim());
  return values;
}

function isTopLevelEnd(text: string): boolean {
  return /^(?:\.end|end)\s*$/i.test(stripComment(text).trim());
}

function stripComment(text: string): string {
  const comment = text.indexOf(';');
  return comment === -1 ? text : text.slice(0, comment);
}

function parseDiagnostic(line: LogicalLineLike, message: string): Diagnostic {
  return {
    severity: 'error',
    code: 'AZMN_PARSE',
    message,
    sourceName: line.sourceName,
    line: line.line,
    column: firstColumn(line.text),
  };
}

function firstColumn(text: string): number {
  const match = /\S/.exec(text);
  return match ? match.index + 1 : 1;
}
