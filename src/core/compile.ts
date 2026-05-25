import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import { assembleProgram } from '../assembly/assemble-program.js';
import { writeIntelHex } from '../outputs/hex.js';
import type { LogicalLine } from '../source/logical-lines.js';
import { createSourceFile } from '../source/source-file.js';
import { scanLogicalLines } from '../source/logical-lines.js';
import { stripLineComment } from '../source/strip-line-comment.js';
import { parseLogicalLine } from '../syntax/parse-line.js';
import { parseExpression, parseTypeExpr } from '../syntax/parse-expression.js';
import { collectOps, expandOpInvocation, parseOpInvocation } from '../expansion/op-expansion.js';
import type { LayoutField } from '../model/source-item.js';
import type { DirectiveAliasPolicy } from '../syntax/directive-aliases.js';
import { normalizeDirectiveAlias } from '../syntax/directive-aliases.js';
import {
  evaluateExpression,
  lookupEquateRecord,
  type EquateRecord,
} from '../semantics/expression-evaluation.js';
import type { Expression } from '../model/expression.js';

export interface CompileNextOptions {
  readonly entryName?: string;
}

export interface CompileSourceResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly symbols: Readonly<Record<string, number>>;
  readonly bytes: Uint8Array;
  readonly hexText: string;
}

interface ParseNextSourceItemsResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly items: readonly SourceItem[];
}

interface ParseNextSourceItemsOptions {
  readonly directiveAliasPolicy?: DirectiveAliasPolicy;
}

export function parseNextSourceItems(
  lines: readonly LogicalLine[],
  options: ParseNextSourceItemsOptions = {},
): ParseNextSourceItemsResult {
  const diagnostics: Diagnostic[] = [];
  const items: SourceItem[] = [];
  const parseOptions =
    options.directiveAliasPolicy === undefined
      ? {}
      : { directiveAliasPolicy: options.directiveAliasPolicy };
  const conditional = applyConditionalAssembly(lines, diagnostics, parseOptions.directiveAliasPolicy);
  const pendingLines = [...conditional.lines];
  const { ops, opLineIndexes } = collectOps(pendingLines, diagnostics, parseOptions);
  let afterTopLevelEnd = false;

  for (let index = 0; index < pendingLines.length; index += 1) {
    if (opLineIndexes.has(index)) {
      continue;
    }
    const line = pendingLines[index]!;
    if (afterTopLevelEnd && !isPostEndParseAllowed(line.text)) {
      continue;
    }

    const colonLayoutHeader = /^([A-Za-z_][A-Za-z0-9_]*):\s*\.(type|union)\s*$/.exec(
      stripLineComment(line.text).trim(),
    );
    if (colonLayoutHeader) {
      const directive = colonLayoutHeader[2] ?? 'type';
      diagnostics.push(
        parseDiagnostic(
          line,
          `Use "${colonLayoutHeader[1] ?? ''} .${directive}" for layouts; colon labels mark addresses.`,
        ),
      );
      const endDirective = directive === 'union' ? '.endunion' : '.endtype';
      for (index += 1; index < pendingLines.length; index += 1) {
        if (stripLineComment(pendingLines[index]!.text).trim() === endDirective) {
          break;
        }
      }
      continue;
    }

    const nameLeftTypeAlias = /^([A-Za-z_][A-Za-z0-9_]*)\s+\.typealias\s+(.+)$/.exec(
      stripLineComment(line.text).trim(),
    );
    if (nameLeftTypeAlias) {
      const typeExprText = nameLeftTypeAlias[2] ?? '';
      const typeExpr = parseTypeExpr(typeExprText);
      if (!typeExpr) {
        diagnostics.push(parseDiagnostic(line, `invalid .typealias target: ${typeExprText}`));
      } else {
        items.push({
          kind: 'type-alias',
          name: nameLeftTypeAlias[1] ?? '',
          typeExpr,
          span: { sourceName: line.sourceName, line: line.line, column: firstColumn(line.text) },
        });
      }
      continue;
    }

    const typeAlias = /^\.type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(
      stripLineComment(line.text).trim(),
    );
    if (typeAlias) {
      diagnostics.push(
        parseDiagnostic(line, `Use "${typeAlias[1] ?? ''} .typealias ..." for type aliases.`),
      );
      continue;
    }

    const nameLeftLayoutHeader = /^([A-Za-z_][A-Za-z0-9_]*)\s+\.(type|union)\s*$/.exec(
      stripLineComment(line.text).trim(),
    );
    const prefixLayoutHeader = /^\.(type|union)\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(
      stripLineComment(line.text).trim(),
    );
    if (prefixLayoutHeader) {
      const directive = prefixLayoutHeader[1] ?? 'type';
      diagnostics.push(
        parseDiagnostic(
          line,
          `Use "${prefixLayoutHeader[2] ?? ''} .${directive}" for layouts.`,
        ),
      );
      const endDirective = directive === 'union' ? '.endunion' : '.endtype';
      for (index += 1; index < pendingLines.length; index += 1) {
        if (stripLineComment(pendingLines[index]!.text).trim() === endDirective) {
          break;
        }
      }
      continue;
    }
    const layoutHeader = nameLeftLayoutHeader
      ? {
          directive: nameLeftLayoutHeader[2] ?? '',
          name: nameLeftLayoutHeader[1] ?? '',
        }
      : undefined;
    if (layoutHeader) {
      const layoutKind = layoutHeader.directive === 'union' ? 'union' : 'record';
      const endDirective = layoutKind === 'union' ? '.endunion' : '.endtype';
      const fields: LayoutField[] = [];
      let terminated = false;
      for (index += 1; index < pendingLines.length; index += 1) {
        const fieldLine = pendingLines[index]!;
        const fieldText = stripLineComment(fieldLine.text).trim();
        if (fieldText.length === 0) {
          continue;
        }
        if (fieldText === endDirective) {
          terminated = true;
          break;
        }
        const field = parseLayoutField(fieldText);
        if (!field) {
          diagnostics.push(
            parseDiagnostic(fieldLine, `invalid .${layoutHeader.directive} field declaration`),
          );
          continue;
        }
        fields.push(field);
      }
      if (!terminated) {
        diagnostics.push(
          parseDiagnostic(
            line,
            `.${layoutHeader.directive} ${layoutHeader.name} missing ${endDirective}`,
          ),
        );
      }
      items.push({
        kind: 'type',
        name: layoutHeader.name,
        layoutKind,
        fields,
        span: { sourceName: line.sourceName, line: line.line, column: firstColumn(line.text) },
      });
      continue;
    }

    const opCall = parseOpInvocation(line);
    if (opCall && !isTopLevelEnd(line.text)) {
      const overloads = ops.get(opCall.name);
      if (overloads) {
        const expanded = expandOpInvocation(ops, overloads, opCall.operands, line, diagnostics);
        if (expanded) {
          items.push(...expanded);
        }
        continue;
      }
    }

    const result = parseLogicalLine(line, parseOptions);
    diagnostics.push(...result.diagnostics);
    items.push(...result.items);
    if (result.items.some((item) => item.kind === 'end')) {
      afterTopLevelEnd = true;
    }
  }

  return { diagnostics, items };
}

interface ConditionalFrame {
  readonly line: LogicalLine;
  readonly parentActive: boolean;
  readonly conditionActive: boolean;
  readonly elseSeen: boolean;
}

function applyConditionalAssembly(
  lines: readonly LogicalLine[],
  diagnostics: Diagnostic[],
  directiveAliasPolicy: DirectiveAliasPolicy | undefined,
): { readonly lines: readonly LogicalLine[] } {
  const out: LogicalLine[] = [];
  const equates = new Map<string, EquateRecord>();
  const locationDependentEquates = new Set<string>();
  const stack: ConditionalFrame[] = [];

  for (const line of lines) {
    const text = stripLineComment(line.text).trim();
    const ifDirective = /^\.if\s+(.+)$/.exec(text);
    if (ifDirective) {
      const parentActive = conditionalActive(stack);
      const expressionText = ifDirective[1] ?? '';
      const value = parentActive
        ? evaluateConditionalExpression(
            line,
            expressionText,
            equates,
            locationDependentEquates,
            diagnostics,
          )
        : undefined;
      const conditionActive = parentActive && value !== undefined && value !== 0;
      stack.push({ line, parentActive, conditionActive, elseSeen: false });
      continue;
    }

    if (/^\.else\s*$/.test(text)) {
      const frame = stack.pop();
      if (!frame) {
        diagnostics.push(parseDiagnostic(line, 'unmatched .else'));
        continue;
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
      continue;
    }

    if (/^\.endif\s*$/.test(text)) {
      if (!stack.pop()) {
        diagnostics.push(parseDiagnostic(line, 'unmatched .endif'));
      }
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
  const statement = /^(@?[A-Za-z_.$?][A-Za-z0-9_.$?]*):\s*(.+)$/.exec(text);
  if (statement && /^\.equ\b/.test(statement[2] ?? '')) {
    return;
  }
  const equ = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s+\.equ\s+(.+)$/.exec(text);
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
  switch (expression.kind) {
    case 'current-location':
      return true;
    case 'symbol': {
      if (locationDependentEquates.has(canonicalConditionalSymbolKey(expression.name))) {
        return true;
      }
      const lookup = lookupEquateRecord(equates, expression.name);
      if (!lookup || visiting.has(canonicalConditionalSymbolKey(lookup.key))) {
        return false;
      }
      const nextVisiting = new Set(visiting);
      nextVisiting.add(canonicalConditionalSymbolKey(lookup.key));
      return expressionReferencesCurrentLocation(
        lookup.record.expression,
        equates,
        locationDependentEquates,
        nextVisiting,
      );
    }
    case 'byte-function':
    case 'unary':
      return expressionReferencesCurrentLocation(
        expression.expression,
        equates,
        locationDependentEquates,
        visiting,
      );
    case 'binary':
      return (
        expressionReferencesCurrentLocation(
          expression.left,
          equates,
          locationDependentEquates,
          visiting,
        ) ||
        expressionReferencesCurrentLocation(
          expression.right,
          equates,
          locationDependentEquates,
          visiting,
        )
      );
    case 'layout-cast':
      return (
        expressionReferencesCurrentLocation(
          expression.base,
          equates,
          locationDependentEquates,
          visiting,
        ) ||
        expression.path.some(
          (part) =>
            part.kind === 'index' &&
            expressionReferencesCurrentLocation(
              part.expression,
              equates,
              locationDependentEquates,
              visiting,
            ),
        )
      );
    case 'number':
    case 'type-size':
    case 'sizeof':
    case 'offset':
      return false;
  }
}

function canonicalConditionalSymbolKey(name: string): string {
  return name.toLowerCase();
}

export type CompileOptions = CompileNextOptions;

export function compileSource(
  sourceText: string,
  options: CompileOptions = {},
): CompileSourceResult {
  const source = createSourceFile(options.entryName ?? '<memory>', sourceText);
  const { diagnostics, items } = parseNextSourceItems(scanLogicalLines(source));

  if (diagnostics.length > 0) {
    return {
      diagnostics,
      symbols: {},
      bytes: new Uint8Array(),
      hexText: writeIntelHex(0, new Uint8Array()),
    };
  }

  const assembly = assembleProgram(items);
  const allDiagnostics = [...diagnostics, ...assembly.diagnostics];
  return {
    diagnostics: allDiagnostics,
    symbols: assembly.symbols,
    bytes: assembly.bytes,
    hexText: writeIntelHex(
      assembly.origin,
      assembly.bytes,
      assembly.reservedAddresses,
      assembly.initializedAddresses,
    ),
  };
}

/** @deprecated Use {@link compileSource}. */
export const compileNext = compileSource;

function isTopLevelEnd(text: string): boolean {
  return /^(?:\.end|end)\s*$/i.test(stripLineComment(text).trim());
}

function isPostEndParseAllowed(text: string): boolean {
  return /^(?:\.binfrom|\.binto|binfrom|binto)\b/i.test(stripLineComment(text).trim());
}

function parseLayoutField(text: string): LayoutField | undefined {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s+(\.(?:field|byte|word|addr))(?:\s+(.+))?$/.exec(text);
  if (!match) {
    return undefined;
  }

  const name = match[1] ?? '';
  const directive = (match[2] ?? '').toLowerCase();
  const operand = match[3]?.trim();
  switch (directive) {
    case '.byte':
      return operand === undefined ? { name, size: 1 } : undefined;
    case '.word':
    case '.addr':
      return operand === undefined ? { name, size: 2 } : undefined;
    case '.field': {
      if (operand === undefined) {
        return undefined;
      }
      const size = /^[0-9]+$/.test(operand) ? Number.parseInt(operand, 10) : undefined;
      if (size !== undefined) {
        return size > 0 ? { name, size } : undefined;
      }
      const scalar = scalarFieldSize(operand);
      if (scalar !== undefined) {
        return { name, size: scalar };
      }
      const typeExpr = parseTypeExpr(operand);
      return typeExpr ? { name, size: 0, typeExpr } : undefined;
    }
  }
}

function scalarFieldSize(typeName: string): number | undefined {
  switch (typeName.toLowerCase()) {
    case 'byte':
      return 1;
    case 'word':
    case 'addr':
      return 2;
    default:
      return undefined;
  }
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
