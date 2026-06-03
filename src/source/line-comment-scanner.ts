interface ScannerState {
  readonly quote?: string;
  readonly escaped?: boolean;
}

type ScanResult =
  | { readonly kind: 'continue'; readonly state: ScannerState }
  | { readonly kind: 'comment' };

export function findLineCommentStart(text: string): number | undefined {
  let state: ScannerState = {};
  for (let index = 0; index < text.length; index += 1) {
    const result = scanCommentChar(text, index, state);
    if (result.kind === 'comment') {
      return index;
    }
    state = result.state;
  }
  return undefined;
}

function scannerState(quote: string | undefined, escaped = false): ScannerState {
  return {
    ...(quote === undefined ? {} : { quote }),
    ...(escaped ? { escaped } : {}),
  };
}

function scanCommentChar(text: string, index: number, state: ScannerState): ScanResult {
  const char = text[index];
  if (state.escaped === true) {
    return { kind: 'continue', state: scannerState(state.quote) };
  }
  if (startsEscape(char, state)) {
    return { kind: 'continue', state: scannerState(state.quote, true) };
  }
  if (startsOrEndsQuote(text, index, state)) {
    return {
      kind: 'continue',
      state: scannerState(state.quote === char ? undefined : (state.quote ?? char)),
    };
  }
  if (char === ';' && state.quote === undefined) {
    return { kind: 'comment' };
  }
  return { kind: 'continue', state };
}

function startsEscape(char: string | undefined, state: ScannerState): boolean {
  return char === '\\' && state.quote !== undefined;
}

function startsOrEndsQuote(text: string, index: number, state: ScannerState): boolean {
  const char = text[index];
  return isQuote(char) && !isApostropheSuffix(text, index, state);
}

function isQuote(char: string | undefined): boolean {
  return char === '"' || char === "'";
}

function isApostropheSuffix(text: string, index: number, state: ScannerState): boolean {
  return (
    state.quote === undefined &&
    text[index] === "'" &&
    /[A-Za-z0-9_]/.test(text[index - 1] ?? '')
  );
}
