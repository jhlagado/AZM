/**
 * Remove an ASM80-style end-of-line comment (`;`), respecting quoted strings.
 */
export function stripLineComment(text: string): string {
  let quote: string | undefined;
  let escaped = false;
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
    if (
      (char === '"' || char === "'") &&
      !(char === "'" && quote === undefined && /[A-Za-z0-9_]/.test(text[index - 1] ?? ''))
    ) {
      quote = quote === char ? undefined : (quote ?? char);
      continue;
    }
    if (char === ';' && !quote) {
      return text.slice(0, index);
    }
  }
  return text;
}
