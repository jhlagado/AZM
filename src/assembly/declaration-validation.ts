import type { Diagnostic } from '../model/diagnostic.js';
import type { RoutineContractDeclaration } from '../model/register-contract.js';
import type { SourceItem } from '../model/source-item.js';
import { diagnostic } from '../semantics/diagnostics.js';
import { privacyUnitKey } from './routine-label-scopes.js';

type RoutineItem = Extract<SourceItem, { readonly kind: 'routine' }>;

interface UnitState {
  owner?: string;
  pending?: RoutineItem;
  active?: { directive: RoutineItem; name: string; hasInstruction: boolean };
}

const REGISTER_CONTRACT_FINDING_KINDS = new Set([
  'definite_contract_violation',
  'declaration_contract_mismatch',
  'flag_lifetime_risk',
  'missing_callee_contract',
  'unknown_control_flow',
  'external_interface_unknown',
  'output_candidate',
]);

function declarationName(item: SourceItem): string | undefined {
  switch (item.kind) {
    case 'label':
    case 'equ':
    case 'enum':
    case 'type':
    case 'type-alias':
      return item.name;
    default:
      return undefined;
  }
}

function isExportedDeclaration(item: SourceItem): boolean {
  return (
    (item.kind === 'label' ||
      item.kind === 'equ' ||
      item.kind === 'enum' ||
      item.kind === 'type' ||
      item.kind === 'type-alias') &&
    item.isExported === true
  );
}

function setIntersection(left: readonly string[], right: readonly string[]): readonly string[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function validateContract(item: RoutineItem, diagnostics: Diagnostic[]): void {
  const contract: RoutineContractDeclaration = item.contract;
  const outClobbers = setIntersection(contract.out, contract.clobbers);
  const preservesWrites = setIntersection(contract.preserves, [
    ...contract.out,
    ...contract.clobbers,
  ]);
  if (outClobbers.length > 0) {
    diagnostics.push(
      diagnostic(
        item.span,
        `.routine contract cannot declare ${outClobbers.join(',')} as both out and clobbers`,
      ),
    );
  }
  if (preservesWrites.length > 0) {
    diagnostics.push(
      diagnostic(
        item.span,
        `.routine contract cannot declare ${preservesWrites.join(',')} as both preserves and written`,
      ),
    );
  }
}

function diagnoseUnfinishedRoutine(state: UnitState, diagnostics: Diagnostic[]): void {
  if (state.pending !== undefined) {
    diagnostics.push(
      diagnostic(
        state.pending.span,
        '.routine must be followed by a non-local label in the same file',
      ),
    );
    delete state.pending;
  }
  if (state.active !== undefined && !state.active.hasInstruction) {
    diagnostics.push(
      diagnostic(
        state.active.directive.span,
        `.routine ${state.active.name} contains no executable instructions`,
      ),
    );
    delete state.active;
  }
}

function validateDeclarationName(item: SourceItem, diagnostics: Diagnostic[]): void {
  const name = declarationName(item);
  if (name === undefined) return;
  if (item.kind === 'label' && item.origin === 'generated') return;
  if (name.startsWith('__')) {
    diagnostics.push(diagnostic(item.span, `symbol "${name}" uses the reserved "__" prefix`));
  }
  if (name.startsWith('_') && isExportedDeclaration(item)) {
    diagnostics.push(
      diagnostic(
        item.span,
        `exported symbol "@${name}" cannot use the local "_" prefix; use "@${name.slice(1)}" or "${name}"`,
      ),
    );
  }
  if (name.startsWith('_') && item.kind !== 'label') {
    diagnostics.push(
      diagnostic(
        item.span,
        `leading "_" local syntax is supported only for labels; rename "${name}"`,
      ),
    );
  }
}

export function validateDeclarationsAndRoutines(
  items: readonly SourceItem[],
  diagnostics: Diagnostic[],
): void {
  const states = new Map<string, UnitState>();
  const policyByFile = new Map<string, SourceItem>();

  for (const item of items) {
    validateDeclarationName(item, diagnostics);
    if (item.kind === 'routine') validateContract(item, diagnostics);
    if (item.kind === 'contracts-policy') {
      const existing = policyByFile.get(item.span.sourceName);
      if (existing !== undefined) {
        diagnostics.push(
          diagnostic(item.span, '.contracts may appear only once in each physical file'),
        );
      } else {
        policyByFile.set(item.span.sourceName, item);
      }
    }
    if (item.kind === 'rc-ignore' && !REGISTER_CONTRACT_FINDING_KINDS.has(item.findingKind)) {
      diagnostics.push(
        diagnostic(item.span, `unknown register-contract finding kind "${item.findingKind}"`),
      );
    }

    const unitKey = privacyUnitKey(item);
    const state = states.get(unitKey) ?? {};
    states.set(unitKey, state);

    if (item.kind === 'comment') continue;
    if (item.kind === 'routine') {
      diagnoseUnfinishedRoutine(state, diagnostics);
      state.pending = item;
      continue;
    }
    if (item.kind === 'label') {
      if (item.origin === 'generated') continue;
      if (item.name.startsWith('_')) {
        if (state.owner === undefined) {
          diagnostics.push(
            diagnostic(item.span, `local symbol "${item.name}" has no preceding non-local owner`),
          );
        }
        if (state.pending !== undefined) {
          diagnostics.push(diagnostic(state.pending.span, '.routine cannot target a local symbol'));
          delete state.pending;
        }
        continue;
      }

      state.owner = item.name;
      if (state.active !== undefined && state.active.hasInstruction) delete state.active;
      if (state.pending !== undefined) {
        if (state.pending.span.sourceName !== item.span.sourceName) {
          diagnostics.push(
            diagnostic(
              state.pending.span,
              '.routine cannot attach to a label in another physical file',
            ),
          );
          delete state.pending;
          continue;
        }
        state.active = { directive: state.pending, name: item.name, hasInstruction: false };
        delete state.pending;
      }
      continue;
    }

    if (state.pending !== undefined) {
      diagnostics.push(
        diagnostic(state.pending.span, '.routine must be followed by a non-local label'),
      );
      delete state.pending;
    }
    if (item.kind === 'instruction') {
      if (state.active !== undefined) state.active.hasInstruction = true;
      continue;
    }
    if (
      item.kind === 'rc-ignore' ||
      item.kind === 'expect-out' ||
      item.kind === 'contracts-policy'
    ) {
      continue;
    }
    if (state.active !== undefined && !state.active.hasInstruction) {
      diagnoseUnfinishedRoutine(state, diagnostics);
    }
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.kind !== 'rc-ignore' && item.kind !== 'expect-out') continue;
    let attached = false;
    for (let next = index + 1; next < items.length; next += 1) {
      const candidate = items[next]!;
      if (
        candidate.kind === 'comment' ||
        candidate.kind === 'rc-ignore' ||
        candidate.kind === 'expect-out'
      )
        continue;
      const candidateSpan =
        candidate.kind === 'instruction'
          ? (candidate.emittedSource?.span ?? candidate.span)
          : candidate.span;
      attached =
        candidate.kind === 'instruction' && candidateSpan.sourceName === item.span.sourceName;
      break;
    }
    if (!attached) {
      diagnostics.push(
        diagnostic(
          item.span,
          `.${item.kind === 'rc-ignore' ? 'rcignore' : 'expectout'} must be followed by an instruction in the same file`,
        ),
      );
    }
  }

  for (const state of states.values()) diagnoseUnfinishedRoutine(state, diagnostics);
}
