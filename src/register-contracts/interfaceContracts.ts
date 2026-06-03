import { expandCarrierList } from './carriers.js';
import { buildRoutineContracts } from './smartComments.js';
import type { LocatedSmartComment, RoutineContract, SmartComment } from './types.js';

const INTERFACE_TAG_RE = /^\s*(in|out|clobbers|preserves)(?:\s+(.+))?$/i;

type InterfaceContractKind = Extract<SmartComment['kind'], 'in' | 'out' | 'clobbers' | 'preserves'>;

const INTERFACE_CONTRACT_BUILDERS: Readonly<
  Record<InterfaceContractKind, (carriers: SmartCommentCarrierList) => SmartComment>
> = {
  in: (carriers) => ({ kind: 'in', carriers }),
  out: (carriers) => ({ kind: 'out', carriers }),
  clobbers: (carriers) => ({ kind: 'clobbers', carriers }),
  preserves: (carriers) => ({ kind: 'preserves', carriers }),
};

type SmartCommentCarrierList = Extract<
  SmartComment,
  { readonly kind: InterfaceContractKind }
>['carriers'];

export function parseInterfaceContracts(
  text: string,
  file = '<register-contracts-interface>',
): Map<string, RoutineContract> {
  const comments: LocatedSmartComment[] = [];
  const lines = text.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith(';')) {
      throw new Error(`${file}:${index + 1}: .asmi files do not permit comments`);
    }
    const comment = parseInterfaceContractLine(line);
    if (comment === undefined) {
      throw new Error(
        `${file}:${index + 1}: invalid register contracts interface line \"${trimmed}\"`,
      );
    }
    comments.push({ file, line: index + 1, comment });
  }
  const routines = buildRoutineContracts(comments);
  const out = new Map<string, RoutineContract>();
  for (const [name, contract] of routines) {
    if (hasContractContent(contract)) out.set(name, contract);
  }
  return out;
}

function parseInterfaceContractLine(line: string): SmartComment | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith(';')) return undefined;

  const boundary = parseInterfaceBoundary(trimmed);
  if (boundary !== undefined) return boundary;

  const match = INTERFACE_TAG_RE.exec(trimmed);
  if (!match) return undefined;
  const tag = match[1]!.toLowerCase() as InterfaceContractKind;
  const carriers = parseInterfaceCarrierList(match[2]?.trim());
  return carriers === undefined ? undefined : INTERFACE_CONTRACT_BUILDERS[tag](carriers);
}

function parseInterfaceBoundary(trimmed: string): SmartComment | undefined {
  const extern = /^extern\s+(\S+)\s*$/i.exec(trimmed);
  if (extern !== null) return { kind: 'extern', name: extern[1]! };
  return /^end\s*$/i.test(trimmed) ? { kind: 'end' } : undefined;
}

function parseInterfaceCarrierList(rest: string | undefined): SmartCommentCarrierList | undefined {
  if (!rest) return undefined;
  const rawCarriers = rest.split(',').map((part) => part.trim());
  if (rawCarriers.length === 0 || rawCarriers.some((part) => part.length === 0)) return undefined;
  const carriers = expandCarrierList(rawCarriers);
  return carriers && carriers.length > 0 ? carriers : undefined;
}

function hasContractContent(contract: RoutineContract): boolean {
  return (
    contract.in.length > 0 ||
    contract.out.length > 0 ||
    contract.clobbers.length > 0 ||
    contract.preserves.length > 0
  );
}
