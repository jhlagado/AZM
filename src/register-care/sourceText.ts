type SourceLines = {
  lines: string[];
  trailingNewline: boolean;
  eol: '\n' | '\r\n';
};

function lineEnding(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

export function splitSourceLines(text: string): SourceLines {
  const eol = lineEnding(text);
  const trailingNewline = text.endsWith('\n');
  const lines = text.split(/\r?\n/);
  if (trailingNewline) lines.pop();
  return { lines, trailingNewline, eol };
}

export function joinSourceLines({ lines, trailingNewline, eol }: SourceLines): string {
  const text = lines.join(eol);
  return trailingNewline ? `${text}${eol}` : text;
}
