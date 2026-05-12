import type { Diagnostic } from '../diagnosticTypes.js';
import type { ProgramNode } from '../frontend/ast.js';
import type { CompileEnv } from './env.js';
import { diagAt } from './storageView.js';
import type { ScalarKind } from './typeQueries.js';
import { runInstructionAcceptance } from './instructionAcceptance.js';
import type { InstructionValidator } from './instructionAcceptance.js';

type TransferCompatibility = ScalarKind | 'address';

function compatibleScalarTransfer(
  dst: TransferCompatibility | undefined,
  src: TransferCompatibility | undefined,
): boolean {
  if (!dst || !src) return false;
  if (dst === src) return true;
  return (
    (dst === 'word' || dst === 'addr' || dst === 'address') &&
    (src === 'word' || src === 'addr' || src === 'address')
  );
}

const assignmentValidator: InstructionValidator = {
  validateInstruction(item, _storage, helpers, diagnostics) {
    if (item.head !== ':=' || item.operands.length !== 2) return;
    const [dst, src] = item.operands;
    if (dst?.kind !== 'Ea' || src?.kind !== 'Ea') return;

    const dstType = helpers.resolveEaTypeExpr(dst.expr);
    const dstScalar = helpers.resolveScalarTypeForLd(dst.expr);

    if (src.explicitAddressOf) {
      const srcType = helpers.resolveEaTypeExpr(src.expr);
      if (!dstScalar || (dstScalar !== 'word' && dstScalar !== 'addr')) {
        diagAt(
          diagnostics,
          item.span,
          `":=" address-of source requires a word/addr destination.`,
        );
        return;
      }
      if (!srcType) {
        diagAt(
          diagnostics,
          item.span,
          `":=" address-of source must reference typed storage, not a raw symbol.`,
        );
      }
      return;
    }

    const srcType = helpers.resolveEaTypeExpr(src.expr);
    const srcScalar = helpers.resolveScalarTypeForLd(src.expr);

    if (!dstScalar) {
      const detail = dstType ? helpers.typeDisplay(dstType) : 'unknown';
      diagAt(diagnostics, item.span, `":=" path target must resolve to scalar storage; got ${detail}.`);
      return;
    }
    if (!srcScalar) {
      const detail = srcType ? helpers.typeDisplay(srcType) : 'unknown';
      diagAt(
        diagnostics,
        item.span,
        `":=" path source must resolve to scalar storage; got ${detail}. Use "@path" for addresses.`,
      );
      return;
    }
    if (!compatibleScalarTransfer(dstScalar, srcScalar)) {
      diagAt(
        diagnostics,
        item.span,
        `":=" path-to-path transfer requires compatible scalar widths; got ${dstScalar} and ${srcScalar}.`,
      );
    }
  },

  validateOpInstruction(item, _op, diagnostics) {
    if (item.head !== ':=' || item.operands.length !== 2) return;
    const [dst, src] = item.operands;
    if (dst?.kind !== 'Ea') return;
    if (src?.kind === 'Ea') {
      const detail = src.explicitAddressOf ? 'address-of' : 'path-to-path';
      diagAt(
        diagnostics,
        item.span,
        `":=" ${detail} storage-target forms are not supported inside ops in this slice.`,
      );
    }
  },
};

export function validateAssignmentAcceptance(
  program: ProgramNode,
  env: CompileEnv,
  diagnostics: Diagnostic[],
): void {
  runInstructionAcceptance(program, env, diagnostics, assignmentValidator);
}
