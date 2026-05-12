import type { SourceSpan, ImmExprNode, EaExprNode, EaIndexNode, AsmOperandNode, TypeExprNode } from '../frontend/ast.js';
import type { NamedSectionContributionSink } from './sectionContributions.js';
import type { SectionKind } from './loweringTypes.js';
import type {
  LoweredAsmItem,
  LoweredAsmStream,
  LoweredAsmStreamBlock,
  LoweredEaExpr,
  LoweredImmExpr,
  LoweredIndexExpr,
  LoweredOperand,
} from './loweredAsmTypes.js';

type PendingUserComments = {
  lines: number[];
  texts: Map<number, string>;
  index: number;
};

export type LoweredAsmStreamRecordingContext = {
  activeSectionRef: { current: SectionKind };
  currentNamedSectionSinkRef: { current: NamedSectionContributionSink | undefined };
  loweredAsmBlocksByKey: Map<string, LoweredAsmStreamBlock>;
  loweredAsmStream: LoweredAsmStream;
  sourceLineComments?: Map<string, Map<number, string>>;
  sourceTexts?: Map<string, string>;
  evalImmNoDiag: (expr: ImmExprNode) => number | undefined;
  symbolicTargetFromExpr: (expr: ImmExprNode) => { baseLower: string; addend: number } | undefined;
  formatImmExprForAsm: (expr: ImmExprNode) => string;
  typeDisplay: (typeExpr: TypeExprNode) => string;
};

export function createLoweredAsmStreamRecordingHelpers(ctx: LoweredAsmStreamRecordingContext) {
  const {
    activeSectionRef,
    currentNamedSectionSinkRef,
    loweredAsmBlocksByKey,
    loweredAsmStream,
    sourceLineComments,
    sourceTexts,
    evalImmNoDiag,
    symbolicTargetFromExpr,
    formatImmExprForAsm,
    typeDisplay,
  } = ctx;

  const getLoweredAsmBlock = (): LoweredAsmStreamBlock => {
    const section = activeSectionRef.current;
    const namedNode = currentNamedSectionSinkRef.current?.contribution.node;
    const namedOrder = currentNamedSectionSinkRef.current?.contribution.order;
    const key = namedNode
      ? `named:${section}:${namedNode.name}:${namedOrder ?? 'unknown'}`
      : `base:${section}`;
    let block = loweredAsmBlocksByKey.get(key);
    if (!block) {
      const namedFields: { name?: string; contributionOrder?: number } = {};
      if (namedNode) namedFields.name = namedNode.name;
      if (namedOrder !== undefined) namedFields.contributionOrder = namedOrder;
      block = {
        kind: namedNode ? 'named' : 'base',
        section,
        ...namedFields,
        items: [],
      };
      loweredAsmBlocksByKey.set(key, block);
      loweredAsmStream.blocks.push(block);
    }
    return block;
  };

  const commentByFileLine = new Map<string, Map<number, string>>();
  const pendingUserComments = new Map<string, PendingUserComments>();
  const emittedUserCommentLines = new Set<string>();
  const lastBlockByFile = new Map<string, LoweredAsmStreamBlock>();

  if (sourceLineComments) {
    for (const [file, lineMap] of sourceLineComments) {
      if (lineMap.size === 0) continue;
      commentByFileLine.set(file, lineMap);
      pendingUserComments.set(file, {
        lines: [...lineMap.keys()].sort((a, b) => a - b),
        texts: lineMap,
        index: 0,
      });
    }
  } else if (sourceTexts) {
    for (const [file, text] of sourceTexts) {
      const lines = text.split(/\r?\n/);
      const lineMap = new Map<number, string>();
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const semi = line.indexOf(';');
        if (semi < 0) continue;
        const commentText = line.slice(semi + 1).trim();
        if (!commentText) continue;
        lineMap.set(i + 1, commentText);
      }
      if (lineMap.size > 0) {
        commentByFileLine.set(file, lineMap);
        pendingUserComments.set(file, {
          lines: [...lineMap.keys()].sort((a, b) => a - b),
          texts: lineMap,
          index: 0,
        });
      }
    }
  }

  const emitPendingUserComments = (span?: SourceSpan): void => {
    if (!span) return;
    const pending = pendingUserComments.get(span.file);
    if (!pending) return;
    while (pending.index < pending.lines.length) {
      const line = pending.lines[pending.index]!;
      if (line > span.start.line) break;
      pending.index += 1;
      const key = `${span.file}:${line}`;
      if (emittedUserCommentLines.has(key)) continue;
      const text = pending.texts.get(line);
      if (!text) continue;
      emittedUserCommentLines.add(key);
      getLoweredAsmBlock().items.push({ kind: 'comment', text, origin: 'user' });
    }
  };

  const recordLoweredAsmItem = (item: LoweredAsmItem, span?: SourceSpan): void => {
    if (item.kind !== 'comment' || item.origin !== 'user') {
      emitPendingUserComments(span);
    }
    if (span) {
      lastBlockByFile.set(span.file, getLoweredAsmBlock());
    }
    getLoweredAsmBlock().items.push(item);
  };

  const flushTrailingUserComments = (): void => {
    for (const [file, pending] of pendingUserComments) {
      if (pending.index >= pending.lines.length) continue;
      const block = lastBlockByFile.get(file);
      if (!block) continue;
      while (pending.index < pending.lines.length) {
        const line = pending.lines[pending.index]!;
        pending.index += 1;
        const key = `${file}:${line}`;
        if (emittedUserCommentLines.has(key)) continue;
        const text = pending.texts.get(line);
        if (!text) continue;
        emittedUserCommentLines.add(key);
        block.items.push({ kind: 'comment', text, origin: 'user' });
      }
    }
  };

  const lowerImmExprForLoweredAsm = (expr: ImmExprNode): LoweredImmExpr => {
    const value = evalImmNoDiag(expr);
    if (value !== undefined) return { kind: 'literal', value };
    if (expr.kind !== 'ImmName') {
      const symbolic = symbolicTargetFromExpr(expr);
      if (symbolic) {
        return { kind: 'symbol', name: symbolic.baseLower, addend: symbolic.addend };
      }
    }
    switch (expr.kind) {
      case 'ImmLiteral':
        return { kind: 'literal', value: expr.value };
      case 'ImmName':
        return { kind: 'symbol', name: expr.name, addend: 0 };
      case 'ImmUnary':
        return {
          kind: 'unary',
          op: expr.op,
          expr: lowerImmExprForLoweredAsm(expr.expr),
        };
      case 'ImmBinary':
        return {
          kind: 'binary',
          op: expr.op,
          left: lowerImmExprForLoweredAsm(expr.left),
          right: lowerImmExprForLoweredAsm(expr.right),
        };
      default:
        return { kind: 'opaque', text: formatImmExprForAsm(expr) };
    }
  };

  const lowerEaExprForLoweredAsm = (expr: EaExprNode): LoweredEaExpr => {
    switch (expr.kind) {
      case 'EaName':
        return { kind: 'name', name: expr.name };
      case 'EaImm':
        return { kind: 'imm', expr: lowerImmExprForLoweredAsm(expr.expr) };
      case 'EaReinterpret':
        return {
          kind: 'reinterpret',
          typeName: typeDisplay(expr.typeExpr),
          base: lowerEaExprForLoweredAsm(expr.base),
        };
      case 'EaField':
        return { kind: 'field', base: lowerEaExprForLoweredAsm(expr.base), field: expr.field };
      case 'EaAdd':
        return {
          kind: 'add',
          base: lowerEaExprForLoweredAsm(expr.base),
          offset: lowerImmExprForLoweredAsm(expr.offset),
        };
      case 'EaSub':
        return {
          kind: 'sub',
          base: lowerEaExprForLoweredAsm(expr.base),
          offset: lowerImmExprForLoweredAsm(expr.offset),
        };
      case 'EaIndex': {
        const lowerIndexExpr = (index: EaIndexNode): LoweredIndexExpr => {
          switch (index.kind) {
            case 'IndexImm':
              return { kind: 'imm', value: lowerImmExprForLoweredAsm(index.value) };
            case 'IndexReg8':
              return { kind: 'reg8', reg: index.reg };
            case 'IndexReg16':
              return { kind: 'reg16', reg: index.reg };
            case 'IndexMemHL':
              return { kind: 'memHL' };
            case 'IndexMemIxIy':
              return {
                kind: 'memIxIy',
                base: index.base,
                ...(index.disp ? { disp: lowerImmExprForLoweredAsm(index.disp) } : {}),
              };
            case 'IndexEa':
              return { kind: 'ea', expr: lowerEaExprForLoweredAsm(index.expr) };
          }
        };
        return {
          kind: 'index',
          base: lowerEaExprForLoweredAsm(expr.base),
          index: lowerIndexExpr(expr.index),
        };
      }
    }
  };

  const lowerOperandForLoweredAsm = (operand: AsmOperandNode): LoweredOperand => {
    switch (operand.kind) {
      case 'Reg':
        return { kind: 'reg', name: operand.name };
      case 'Imm':
        return { kind: 'imm', expr: lowerImmExprForLoweredAsm(operand.expr) };
      case 'Ea':
        return { kind: 'ea', expr: lowerEaExprForLoweredAsm(operand.expr) };
      case 'Mem':
        return { kind: 'mem', expr: lowerEaExprForLoweredAsm(operand.expr) };
      case 'PortImm8':
        return { kind: 'portImm8', expr: lowerImmExprForLoweredAsm(operand.expr) };
      case 'PortC':
        return { kind: 'portC' };
    }
  };

  return {
    flushTrailingUserComments,
    getLoweredAsmBlock,
    lowerImmExprForLoweredAsm,
    lowerOperandForLoweredAsm,
    recordLoweredAsmItem,
  };
}