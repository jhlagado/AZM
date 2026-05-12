import type { EnumDeclNode, SourceSpan } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { diagInvalidHeaderLine, formatIdentifierToken } from './parseModuleCommon.js';

type ParseEnumContext = {
  diagnostics: Diagnostic[];
  modulePath: string;
  lineNo: number;
  text: string;
  span: SourceSpan;
  isReservedTopLevelName: (name: string) => boolean;
};

export function parseEnumDecl(
  enumTail: string,
  ctx: ParseEnumContext,
  exported = false,
): EnumDeclNode | undefined {
  const { diagnostics, modulePath, lineNo, text, span, isReservedTopLevelName } = ctx;
  const decl = enumTail;
  const nameMatch = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(.*))?$/.exec(decl);
  if (!nameMatch) {
    const invalidName = decl.split(/\s+/, 1)[0] ?? '';
    if (invalidName.length > 0) {
      diag(
        diagnostics,
        modulePath,
        `Invalid enum name ${formatIdentifierToken(invalidName)}: expected <identifier>.`,
        { line: lineNo, column: 1 },
      );
    } else {
      diagInvalidHeaderLine(
        diagnostics,
        modulePath,
        'enum declaration',
        text,
        '<name> <member>[, ...]',
        lineNo,
      );
    }
    return undefined;
  }

  const name = nameMatch[1]!;
  if (isReservedTopLevelName(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid enum name "${name}": collides with a top-level keyword.`,
      {
        line: lineNo,
        column: 1,
      },
    );
    return undefined;
  }
  const membersText = (nameMatch[2] ?? '').trim();
  if (membersText.length === 0) {
    diag(diagnostics, modulePath, `Enum "${name}" must declare at least one member`, {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }

  const rawParts = membersText.split(',').map((p) => p.trim());
  if (rawParts.some((p) => p.length === 0)) {
    diag(diagnostics, modulePath, `Trailing commas are not permitted in enum member lists`, {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }

  const members: string[] = [];
  const membersLower = new Set<string>();
  for (const m of rawParts) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(m)) {
      diag(
        diagnostics,
        modulePath,
        `Invalid enum member name ${formatIdentifierToken(m)}: expected <identifier>.`,
        {
          line: lineNo,
          column: 1,
        },
      );
      continue;
    }
    if (isReservedTopLevelName(m)) {
      diag(
        diagnostics,
        modulePath,
        `Invalid enum member name "${m}": collides with a top-level keyword.`,
        {
          line: lineNo,
          column: 1,
        },
      );
      continue;
    }
    const memberLower = m.toLowerCase();
    if (membersLower.has(memberLower)) {
      diag(diagnostics, modulePath, `Duplicate enum member name "${m}".`, {
        line: lineNo,
        column: 1,
      });
      continue;
    }
    membersLower.add(memberLower);
    members.push(m);
  }

  return { kind: 'EnumDecl', span, name, exported, members };
}
