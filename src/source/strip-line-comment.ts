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

/** Trailing `;` comment text, or undefined when absent or whitespace-only. */
export function extractLineComment(text: string): string | undefined {
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
      const comment = text.slice(index + 1).trim();
      return comment.length > 0 ? comment : undefined;
    }
  }
  return undefined;
}
