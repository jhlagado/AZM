import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import { assembleProgram } from '../assembly/assemble-program.js';
import { writeIntelHex } from '../outputs/hex.js';
import { createSourceFile } from '../source/source-file.js';
import { scanLogicalLines } from '../source/logical-lines.js';
import { parseLogicalLine } from '../syntax/parse-line.js';
import { parseTypeExpr } from '../syntax/parse-expression.js';
import type { LayoutField } from '../model/source-item.js';

export interface CompileNextOptions {
  readonly entryName?: string;
}

export interface CompileNextResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly symbols: Readonly<Record<string, number>>;
  readonly bytes: Uint8Array;
  readonly hexText: string;
}

export function compileNext(
  sourceText: string,
  options: CompileNextOptions = {},
): CompileNextResult {
  const source = createSourceFile(options.entryName ?? '<memory>', sourceText);
  const diagnostics: Diagnostic[] = [];
  const items: SourceItem[] = [];
  const pendingLines = [...scanLogicalLines(source)];

  for (let index = 0; index < pendingLines.length; index += 1) {
    const line = pendingLines[index]!;
    const layoutHeader = /^\.(type|union)\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/i.exec(
      stripComment(line.text).trim(),
    );
    if (layoutHeader) {
      const layoutKind = (layoutHeader[1] ?? '').toLowerCase() === 'union' ? 'union' : 'record';
      const endDirective = layoutKind === 'union' ? '.endunion' : '.endtype';
      const fields: LayoutField[] = [];
      let terminated = false;
      for (index += 1; index < pendingLines.length; index += 1) {
        const fieldLine = pendingLines[index]!;
        const fieldText = stripComment(fieldLine.text).trim();
        if (fieldText.length === 0) {
          continue;
        }
        if (fieldText.toLowerCase() === endDirective) {
          terminated = true;
          break;
        }
        const field = parseLayoutField(fieldText);
        if (!field) {
          diagnostics.push(parseDiagnostic(fieldLine, 'invalid .type field declaration'));
          continue;
        }
        fields.push(field);
      }
      if (!terminated) {
        diagnostics.push(
          parseDiagnostic(
            line,
            `.${layoutHeader[1] ?? ''} ${layoutHeader[2] ?? ''} missing ${endDirective}`,
          ),
        );
      }
      items.push({
        kind: 'type',
        name: layoutHeader[2] ?? '',
        layoutKind,
        fields,
        span: { sourceName: line.sourceName, line: line.line, column: firstColumn(line.text) },
      });
      continue;
    }

    const result = parseLogicalLine(line);
    diagnostics.push(...result.diagnostics);
    items.push(...result.items);
  }

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
    hexText: writeIntelHex(assembly.origin, assembly.bytes),
  };
}

function parseLayoutField(text: string): LayoutField | undefined {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s+(\.(?:field|byte|word|addr))(?:\s+(.+))?$/i.exec(text);
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

function stripComment(text: string): string {
  const comment = text.indexOf(';');
  return comment === -1 ? text : text.slice(0, comment);
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
