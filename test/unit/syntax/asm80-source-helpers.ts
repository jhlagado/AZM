import type { Diagnostic } from '../../../src/model/diagnostic.js';
import type { SourceItem } from '../../../src/model/source-item.js';
import { parseNextSourceItems } from '../../../src/core/compile.js';
import { scanLogicalLines } from '../../../src/source/logical-lines.js';
import { createSourceFile } from '../../../src/source/source-file.js';
import type { DirectiveAliasPolicy } from '../../../src/syntax/directive-aliases.js';

import { azmDirectiveAliases } from './asm80-alias-helpers.js';

export function parseAsm80Source(
  source: string,
  policy: DirectiveAliasPolicy = azmDirectiveAliases,
): { diagnostics: readonly Diagnostic[]; items: readonly SourceItem[] } {
  const file = createSourceFile('/asm.z80', source.endsWith('\n') ? source : `${source}\n`);
  return parseNextSourceItems(scanLogicalLines(file), { directiveAliasPolicy: policy });
}

export function sourceItemKinds(items: readonly SourceItem[]): string[] {
  return items.map((item) => item.kind);
}

export function sourceItemNames(items: readonly SourceItem[]): Array<string | undefined> {
  return items.map((item) =>
    item.kind === 'label' || item.kind === 'equ' ? item.name : undefined,
  );
}
