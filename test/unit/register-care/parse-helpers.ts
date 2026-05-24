import { parseNextSourceItems } from '../../../src/core/compile.js';
import type { SourceItem } from '../../../src/model/source-item.js';
import { scanLogicalLines } from '../../../src/source/logical-lines.js';
import { createSourceFile } from '../../../src/source/source-file.js';
import { azmDirectiveAliases } from '../syntax/asm80-parse-helpers.js';

export function parseRegisterCareItems(path: string, text: string): readonly SourceItem[] {
  const source = text.endsWith('\n') ? text : `${text}\n`;
  const file = createSourceFile(path, source);
  const { diagnostics, items } = parseNextSourceItems(scanLogicalLines(file), {
    directiveAliasPolicy: azmDirectiveAliases,
  });
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length > 0) {
    throw new Error(JSON.stringify(errors));
  }
  return items;
}

export function parseRegisterCareItemsFromSources(
  sources: ReadonlyArray<{ path: string; text: string }>,
): readonly SourceItem[] {
  return sources.flatMap((source) => parseRegisterCareItems(source.path, source.text));
}
