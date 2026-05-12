import type { EmittedSourceSegment } from '../formats/types.js';
import type { NonBankedSectionKeyCollection } from '../sectionKeys.js';
import { createNamedSectionContributionSinks, type NamedSectionContributionSink } from './sectionContributions.js';
import { createLoweredAsmStreamRecordingHelpers } from './loweredAsmStreamRecording.js';
import type { SourceSpan, ImmExprNode } from '../frontend/ast.js';
import type { SectionKind, SourceSegmentTag } from './loweringTypes.js';
import type {
  LoweredAsmStream,
  LoweredAsmStreamBlock,
} from './loweredAsmTypes.js';

type EmitStateContext = {
  /** Optional named section metadata for contribution sinks. */
  namedSectionKeys?: NonBankedSectionKeyCollection;
  /** Full source text per file for listings. */
  sourceTexts?: Map<string, string>;
  /** Line-end comments keyed by file and line. */
  sourceLineComments?: Map<string, Map<number, string>>;
  /** Code section byte map. */
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
  symbolicTargetFromExpr: (
    expr: ImmExprNode,
  ) => { baseLower: string; addend: number } | undefined;
  /** Formats an imm for lowered asm text. */
  formatImmExprForAsm: (expr: ImmExprNode) => string;
  /** Pretty-prints a type for traces. */
  typeDisplay: (typeExpr: import('../frontend/ast.js').TypeExprNode) => string;
};

export function createEmitStateHelpers(ctx: EmitStateContext) {
  let activeSection: SectionKind = 'code';
  let codeOffset = 0;
  let dataOffset = 0;
  let varOffset = 0;
  let currentCodeSegmentTag: SourceSegmentTag | undefined;
  let generatedLabelCounter = 0;
  let currentNamedSectionSink: NamedSectionContributionSink | undefined;

  const namedSectionSinks = ctx.namedSectionKeys
    ? createNamedSectionContributionSinks(ctx.namedSectionKeys)
    : [];
  const namedSectionSinksByNode = new Map(
    namedSectionSinks.map((sink) => [sink.contribution.node, sink] as const),
  );

  const sameSourceTag = (x: SourceSegmentTag, y: SourceSegmentTag): boolean =>
    x.file === y.file &&
    x.line === y.line &&
    x.column === y.column &&
    x.kind === y.kind &&
    x.confidence === y.confidence;

  const recordCodeSourceRange = (start: number, end: number): void => {
    if (!currentCodeSegmentTag || end <= start) return;
    const segments = currentNamedSectionSink?.sourceSegments ?? ctx.codeSourceSegments;
    const last = segments[segments.length - 1];
    if (last && last.end === start && sameSourceTag(last, currentCodeSegmentTag)) {
      last.end = end;
      return;
    }
    segments.push({ ...currentCodeSegmentTag, start, end });
  };

  const activeSectionRef = {
    get current() {
      return activeSection;
    },
    set current(value: SectionKind) {
      activeSection = value;
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
  const varOffsetRef = {
    get current() {
      return varOffset;
    },
    set current(value: number) {
      varOffset = value;
    },
  };
  const currentCodeSegmentTagRef = {
    get current() {
      return currentCodeSegmentTag;
    },
    set current(value: SourceSegmentTag | undefined) {
      currentCodeSegmentTag = value;
      if (currentNamedSectionSink) currentNamedSectionSink.currentSourceTag = value;
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
  const currentNamedSectionSinkRef = {
    get current() {
      return currentNamedSectionSink;
    },
    set current(value: NamedSectionContributionSink | undefined) {
      currentNamedSectionSink = value;
    },
  };

  const getCurrentCodeOffset = (): number => currentNamedSectionSink?.offset ?? codeOffset;
  const setCurrentCodeOffset = (value: number): void => {
    if (currentNamedSectionSink) currentNamedSectionSink.offset = value;
    else codeOffset = value;
  };
  const setCurrentCodeByte = (offset: number, value: number): void => {
    const bytesOut = currentNamedSectionSink?.bytes ?? ctx.codeBytes;
    bytesOut.set(offset, value);
  };
  const pushCurrentFixup = (fixup: {
    offset: number;
    baseLower: string;
    addend: number;
    file: string;
  }): void => {
    if (currentNamedSectionSink) currentNamedSectionSink.fixups.push(fixup);
    else ctx.fixups.push(fixup);
  };
  const pushCurrentRel8Fixup = (fixup: {
    offset: number;
    origin: number;
    baseLower: string;
    addend: number;
    file: string;
    mnemonic: string;
  }): void => {
    if (currentNamedSectionSink) currentNamedSectionSink.rel8Fixups.push(fixup);
    else ctx.rel8Fixups.push(fixup);
  };

  const advanceAlign = (a: number): void => {
    switch (activeSection) {
      case 'code':
        codeOffset = ctx.alignTo(codeOffset, a);
        return;
      case 'data':
        dataOffset = ctx.alignTo(dataOffset, a);
        return;
      case 'var':
        varOffset = ctx.alignTo(varOffset, a);
        return;
    }
  };

  const {
    flushTrailingUserComments,
    lowerImmExprForLoweredAsm,
    lowerOperandForLoweredAsm,
    recordLoweredAsmItem,
  } = createLoweredAsmStreamRecordingHelpers({
    activeSectionRef,
    currentNamedSectionSinkRef,
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
    recordLoweredAsmItem({ kind: 'comment', text, origin: 'zax' });
  };

  return {
    namedSectionSinks,
    namedSectionSinksByNode,
    activeSectionRef,
    codeOffsetRef,
    dataOffsetRef,
    varOffsetRef,
    currentCodeSegmentTagRef,
    generatedLabelCounterRef,
    currentNamedSectionSinkRef,
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