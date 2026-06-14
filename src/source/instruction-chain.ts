import { findLineCommentStart } from './line-comment-scanner.js';

export interface InstructionChainSegment {
  readonly text: string;
  readonly column: number;
}

interface ScannerState {
  quote?: string;
  escaped?: boolean;
}

export function splitInstructionChain(text: string): readonly InstructionChainSegment[] | undefined {
  const commentStart = findLineCommentStart(text);
  const codeText = commentStart === undefined ? text : text.slice(0, commentStart);
  const separators = findChainSeparators(codeText);
  if (separators.length === 0) return undefined;

  const segments: InstructionChainSegment[] = [];
  let start = 0;
  for (const separator of [...separators, codeText.length]) {
    const raw = codeText.slice(start, separator);
    segments.push(segmentFromRaw(raw, start));
    start = separator + 1;
  }
  return segments;
}

function findChainSeparators(text: string): number[] {
  const separators: number[] = [];
  let state: ScannerState = {};
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (state.escaped === true) {
      state = { ...state, escaped: false };
      continue;
    }
    if (char === '\\' && state.quote !== undefined) {
      state = { ...state, escaped: true };
      continue;
    }
    if (startsOrEndsQuote(text, index, state)) {
      state =
        state.quote === char
          ? withoutQuote(state)
          : withQuote(state, state.quote ?? char ?? '');
      continue;
    }
    if (char === '\\' && isReadableSeparator(text, index)) {
      separators.push(index);
    }
  }
  return separators;
}

function segmentFromRaw(raw: string, rawStart: number): InstructionChainSegment {
  const leading = /^\s*/.exec(raw)?.[0].length ?? 0;
  const trailing = /\s*$/.exec(raw)?.[0].length ?? 0;
  const text = raw.slice(leading, raw.length - trailing);
  return {
    text,
    column: rawStart + (text.length === 0 ? 0 : leading) + 1,
  };
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

function withoutQuote(state: ScannerState): ScannerState {
  return state.escaped === true ? { escaped: true } : {};
}

function withQuote(state: ScannerState, quote: string): ScannerState {
  return {
    quote,
    ...(state.escaped === true ? { escaped: true } : {}),
  };
}

function isReadableSeparator(text: string, index: number): boolean {
  return /\s/.test(text[index - 1] ?? '') && /\s/.test(text[index + 1] ?? '');
}
