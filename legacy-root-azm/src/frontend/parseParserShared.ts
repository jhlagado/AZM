import { TOP_LEVEL_KEYWORDS } from './grammarData.js';

export function isReservedTopLevelDeclName(name: string): boolean {
  return TOP_LEVEL_KEYWORDS.has(name.toLowerCase());
}

export function stripLineComment(line: string): string {
  const semi = line.indexOf(';');
  return semi >= 0 ? line.slice(0, semi) : line;
}
