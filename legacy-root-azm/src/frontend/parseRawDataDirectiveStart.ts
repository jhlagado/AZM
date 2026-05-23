export function looksLikeRawDataDirectiveStart(text: string): boolean {
  return /^(db|dw|ds)\b/i.test(text) || /^[A-Za-z_][A-Za-z0-9_]*\s*:\s*(db|dw|ds)\b/i.test(text);
}
