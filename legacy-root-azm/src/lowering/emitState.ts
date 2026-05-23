import type { EmittedSourceSegment } from '../formats/types.js';
import { createLoweredAsmStreamRecordingHelpers } from './loweredAsmStreamRecording.js';
import type { SourceSpan, ImmExprNode } from '../frontend/ast.js';
import type { PlacementKind, SourceSegmentTag } from './loweringTypes.js';
import type { LoweredAsmStream, LoweredAsmStreamBlock } from './loweredAsmTypes.js';

type EmitStateContext = {
  /** Full source text per file for listings. */
  sourceTexts?: Map<string, string>;
  /** Line-end comments keyed by file and line. */
  sourceLineComments?: Map<string, Map<number, string>>;
  /** Code-placement byte map. */
  codeBytes: Map<number, number>;
  /** Source segment ranges for code bytes. */
  codeSourceSegments: EmittedSourceSegment[];
  /** Pending abs16 fixups. */
  fixups: Array<{ offset: number; baseLower: string; addend: number; file: string }>;
  /** Pending rel8 fixups. */
  rel8Fixups: Array<{
    offset: number;
    origin: number;
    baseLower: string;
    addend: number;
    file: string;
    mnemonic: string;
  }>;
  /** Lowered asm trace stream. */
  loweredAsmStream: LoweredAsmStream;
  /** Lowered asm blocks keyed for random access. */
  loweredAsmBlocksByKey: Map<string, LoweredAsmStreamBlock>;
  /** Alignment helper. */
  alignTo: (n: number, alignment: number) => number;
  /** Best-effort imm evaluation. */
  evalImmNoDiag: (expr: ImmExprNode) => number | undefined;
  /** Parses simple symbolic targets; `undefined` if not symbolic. */
  symbolicTargetFromExpr: (expr: ImmExprNode) => { baseLower: string; addend: number } | undefined;
  /** Formats an imm for lowered asm text. */
  formatImmExprForAsm: (expr: ImmExprNode) => string;
  /** Pretty-prints a type for traces. */
  typeDisplay: (typeExpr: import('../frontend/ast.js').TypeExprNode) => string;
};

export function createEmitStateHelpers(ctx: EmitStateContext) {
  let activePlacement: PlacementKind = 'code';
  let codeOffset = 0;
  let dataOffset = 0;
  let currentCodeSegmentTag: SourceSegmentTag | undefined;
  let generatedLabelCounter = 0;

  const sameSourceTag = (x: SourceSegmentTag, y: SourceSegmentTag): boolean =>
    x.file === y.file &&
    x.line === y.line &&
    x.column === y.column &&
    x.kind === y.kind &&
    x.confidence === y.confidence;

  const recordCodeSourceRange = (start: number, end: number): void => {
    if (!currentCodeSegmentTag || end <= start) return;
    const segments = ctx.codeSourceSegments;
    const last = segments[segments.length - 1];
    if (last && last.end === start && sameSourceTag(last, currentCodeSegmentTag)) {
      last.end = end;
      return;
    }
    segments.push({ ...currentCodeSegmentTag, start, end });
  };

  const activePlacementRef = {
    get current() {
      return activePlacement;
    },
    set current(value: PlacementKind) {
      activePlacement = value;
    },
  };
  const codeOffsetRef = {
    get current() {
      return codeOffset;
    },
    set current(value: number) {
      codeOffset = value;
    },
  };
  const dataOffsetRef = {
    get current() {
      return dataOffset;
    },
    set current(value: number) {
      dataOffset = value;
    },
  };
  const currentCodeSegmentTagRef = {
    get current() {
      return currentCodeSegmentTag;
    },
    set current(value: SourceSegmentTag | undefined) {
      currentCodeSegmentTag = value;
    },
  };
  const generatedLabelCounterRef = {
    get current() {
      return generatedLabelCounter;
    },
    set current(value: number) {
      generatedLabelCounter = value;
    },
  };
  const getCurrentCodeOffset = (): number => codeOffset;
  const setCurrentCodeOffset = (value: number): void => {
    codeOffset = value;
  };
  const setCurrentCodeByte = (offset: number, value: number): void => {
    ctx.codeBytes.set(offset, value);
  };
  const pushCurrentFixup = (fixup: {
    offset: number;
    baseLower: string;
    addend: number;
    file: string;
  }): void => {
    ctx.fixups.push(fixup);
  };
  const pushCurrentRel8Fixup = (fixup: {
    offset: number;
    origin: number;
    baseLower: string;
    addend: number;
    file: string;
    mnemonic: string;
  }): void => {
    ctx.rel8Fixups.push(fixup);
  };

  const advanceAlign = (a: number): void => {
    switch (activePlacement) {
      case 'code':
        codeOffset = ctx.alignTo(codeOffset, a);
        return;
      case 'data':
        dataOffset = ctx.alignTo(dataOffset, a);
        return;
    }
  };

  const {
    flushTrailingUserComments,
    lowerImmExprForLoweredAsm,
    lowerOperandForLoweredAsm,
    recordLoweredAsmItem,
  } = createLoweredAsmStreamRecordingHelpers({
    activePlacementRef,
    loweredAsmBlocksByKey: ctx.loweredAsmBlocksByKey,
    loweredAsmStream: ctx.loweredAsmStream,
    ...(ctx.sourceLineComments ? { sourceLineComments: ctx.sourceLineComments } : {}),
    ...(ctx.sourceTexts ? { sourceTexts: ctx.sourceTexts } : {}),
    evalImmNoDiag: ctx.evalImmNoDiag,
    symbolicTargetFromExpr: ctx.symbolicTargetFromExpr,
    formatImmExprForAsm: ctx.formatImmExprForAsm,
    typeDisplay: ctx.typeDisplay,
  });

  const traceLabel = (_offset: number, name: string, span?: SourceSpan): void => {
    recordLoweredAsmItem({ kind: 'label', name }, span);
  };

  const traceComment = (_offset: number, text: string): void => {
    recordLoweredAsmItem({ kind: 'comment', text, origin: 'generated' });
  };

  return {
    activePlacementRef,
    codeOffsetRef,
    dataOffsetRef,
    currentCodeSegmentTagRef,
    generatedLabelCounterRef,
    getCurrentCodeOffset,
    setCurrentCodeOffset,
    setCurrentCodeByte,
    pushCurrentFixup,
    pushCurrentRel8Fixup,
    recordCodeSourceRange,
    traceLabel,
    traceComment,
    advanceAlign,
    flushTrailingUserComments,
    lowerImmExprForLoweredAsm,
    lowerOperandForLoweredAsm,
    recordLoweredAsmItem,
  };
}
