import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { LogicalLine } from '../source/logical-lines.js';
import { stripLineComment } from '../source/strip-line-comment.js';
import { normalizeDirectiveAlias, type DirectiveAliasPolicy } from '../syntax/directive-aliases.js';
import { parseExpression } from '../syntax/parse-expression.js';
import {
  evaluateExpression,
  lookupEquateRecord,
  type EquateRecord,
} from '../semantics/expression-evaluation.js';

interface ConditionalFrame {
  readonly line: LogicalLine;
  readonly parentActive: boolean;
  readonly conditionActive: boolean;
  readonly elseSeen: boolean;
}

type ConditionalDirective =
  | { readonly kind: 'if'; readonly expressionText: string }
  | { readonly kind: 'else' }
  | { readonly kind: 'endif' }
  | { readonly kind: 'none' };

export function applyConditionalAssembly(
  lines: readonly LogicalLine[],
  diagnostics: Diagnostic[],
  directiveAliasPolicy: DirectiveAliasPolicy | undefined,
): { readonly lines: readonly LogicalLine[] } {
  const out: LogicalLine[] = [];
  const equates = new Map<string, EquateRecord>();
  const locationDependentEquates = new Set<string>();
  const stack: ConditionalFrame[] = [];

  for (const line of lines) {
    const directive = parseConditionalDirective(line);
    if (applyConditionalDirective(
      directive,
      line,
      stack,
      equates,
      locationDependentEquates,
      diagnostics,
    )) {
      continue;
    }

    if (!conditionalActive(stack)) {
      continue;
    }

    out.push(line);
    recordConditionalEquate(line, equates, locationDependentEquates, directiveAliasPolicy);
  }

  for (const frame of stack) {
    diagnostics.push(parseDiagnostic(frame.line, 'unterminated .if'));
  }

  return { lines: out };
}

function parseConditionalDirective(line: LogicalLine): ConditionalDirective {
  const text = stripLineComment(line.text).trim();
  const ifDirective = /^\.if\s+(.+)$/.exec(text);
  if (ifDirective) return { kind: 'if', expressionText: ifDirective[1] ?? '' };
  if (/^\.else\s*$/.test(text)) return { kind: 'else' };
  if (/^\.endif\s*$/.test(text)) return { kind: 'endif' };
  return { kind: 'none' };
}

function applyConditionalDirective(
  directive: ConditionalDirective,
  line: LogicalLine,
  stack: ConditionalFrame[],
  equates: ReadonlyMap<string, EquateRecord>,
  locationDependentEquates: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): boolean {
  switch (directive.kind) {
    case 'if':
      pushConditionalFrame(
        line,
        directive.expressionText,
        stack,
        equates,
        locationDependentEquates,
        diagnostics,
      );
      return true;
    case 'else':
      flipConditionalFrame(line, stack, diagnostics);
      return true;
    case 'endif':
      popConditionalFrame(line, stack, diagnostics);
      return true;
    case 'none':
      return false;
  }
}

function pushConditionalFrame(
  line: LogicalLine,
  expressionText: string,
  stack: ConditionalFrame[],
  equates: ReadonlyMap<string, EquateRecord>,
  locationDependentEquates: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): void {
  const parentActive = conditionalActive(stack);
  const value = parentActive
    ? evaluateConditionalExpression(
        line,
        expressionText,
        equates,
        locationDependentEquates,
        diagnostics,
      )
    : undefined;
  stack.push({
    line,
    parentActive,
    conditionActive: parentActive && value !== undefined && value !== 0,
    elseSeen: false,
  });
}

function flipConditionalFrame(
  line: LogicalLine,
  stack: ConditionalFrame[],
  diagnostics: Diagnostic[],
): void {
  const frame = stack.pop();
  if (!frame) {
    diagnostics.push(parseDiagnostic(line, 'unmatched .else'));
    return;
  }
  if (frame.elseSeen) {
    diagnostics.push(parseDiagnostic(line, 'duplicate .else'));
  }
  stack.push({
    line: frame.line,
    parentActive: frame.parentActive,
    conditionActive: frame.parentActive && !frame.conditionActive,
    elseSeen: true,
  });
}

function popConditionalFrame(
  line: LogicalLine,
  stack: ConditionalFrame[],
  diagnostics: Diagnostic[],
): void {
  if (!stack.pop()) {
    diagnostics.push(parseDiagnostic(line, 'unmatched .endif'));
  }
}

function conditionalActive(stack: readonly ConditionalFrame[]): boolean {
  return stack.every((frame) => frame.parentActive && frame.conditionActive);
}

function evaluateConditionalExpression(
  line: LogicalLine,
  expressionText: string,
  equates: ReadonlyMap<string, EquateRecord>,
  locationDependentEquates: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): number | undefined {
  const expression = parseExpression(expressionText);
  if (!expression) {
    diagnostics.push(parseDiagnostic(line, `invalid .if expression: ${expressionText}`));
    return undefined;
  }
  if (expressionReferencesCurrentLocation(expression, equates, locationDependentEquates)) {
    diagnostics.push(
      parseDiagnostic(
        line,
        'invalid .if expression: current location is not available during conditional assembly',
      ),
    );
    return undefined;
  }
  return evaluateExpression(
    expression,
    {},
    equates,
    { sourceName: line.sourceName, line: line.line, column: firstColumn(line.text) },
    diagnostics,
    { currentLocation: 0 },
  );
}

function recordConditionalEquate(
  line: LogicalLine,
  equates: Map<string, EquateRecord>,
  locationDependentEquates: Set<string>,
  directiveAliasPolicy: DirectiveAliasPolicy | undefined,
): void {
  const text = normalizeDirectiveAlias(
    stripLineComment(line.text),
    directiveAliasPolicy,
  ).trim();
  const equ = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*)(?::\s*|\s+)\.equ\s+(.+)$/.exec(text);
  if (!equ) {
    return;
  }

  const name = equ[1] ?? '';
  const expressionText = equ[2] ?? '';
  const expression = parseExpression(expressionText);
  if (!expression) {
    return;
  }
  if (expressionReferencesCurrentLocation(expression, equates, locationDependentEquates)) {
    locationDependentEquates.add(canonicalConditionalSymbolKey(name));
  }
  equates.set(name, {
    expression,
    span: { sourceName: line.sourceName, line: line.line, column: firstColumn(line.text) },
    currentLocation: 0,
  });
}

function expressionReferencesCurrentLocation(
  expression: Expression,
  equates: ReadonlyMap<string, EquateRecord>,
  locationDependentEquates: ReadonlySet<string>,
  visiting: ReadonlySet<string> = new Set(),
): boolean {
  if (expression.kind === 'current-location') return true;
  if (expression.kind === 'symbol') {
    return symbolReferencesCurrentLocation(
      expression.name,
      equates,
      locationDependentEquates,
      visiting,
    );
  }
  return expressionChildExpressions(expression).some((child) =>
    expressionReferencesCurrentLocation(child, equates, locationDependentEquates, visiting),
  );
}

function expressionChildExpressions(expression: Expression): readonly Expression[] {
  switch (expression.kind) {
    case 'byte-function':
    case 'unary':
      return [expression.expression];
    case 'binary':
      return [expression.left, expression.right];
    case 'layout-cast':
      return layoutCastChildExpressions(expression);
    default:
      return [];
  }
}

function layoutCastChildExpressions(
  expression: Extract<Expression, { readonly kind: 'layout-cast' }>,
): readonly Expression[] {
  return [
    expression.base,
    ...expression.path.flatMap((part) => (part.kind === 'index' ? [part.expression] : [])),
  ];
}

function symbolReferencesCurrentLocation(
  name: string,
  equates: ReadonlyMap<string, EquateRecord>,
  locationDependentEquates: ReadonlySet<string>,
  visiting: ReadonlySet<string>,
): boolean {
  if (locationDependentEquates.has(canonicalConditionalSymbolKey(name))) {
    return true;
  }
  const lookup = lookupEquateRecord(equates, name);
  if (!lookup) return false;
  return equateReferencesCurrentLocation(lookup, equates, locationDependentEquates, visiting);
}

function equateReferencesCurrentLocation(
  lookup: { readonly key: string; readonly record: EquateRecord },
  equates: ReadonlyMap<string, EquateRecord>,
  locationDependentEquates: ReadonlySet<string>,
  visiting: ReadonlySet<string>,
): boolean {
  const key = canonicalConditionalSymbolKey(lookup.key);
  if (visiting.has(key)) return false;
  const nextVisiting = new Set(visiting);
  nextVisiting.add(key);
  return expressionReferencesCurrentLocation(
    lookup.record.expression,
    equates,
    locationDependentEquates,
    nextVisiting,
  );
}

function canonicalConditionalSymbolKey(name: string): string {
  return name.toLowerCase();
}

function parseDiagnostic(
  line: { readonly sourceName: string; readonly line: number; readonly text: string },
  message: string,
): Diagnostic {
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
