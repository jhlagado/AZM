import { expandCarrierList } from './carriers.js';
import { rstServiceTargetName } from './profiles.js';
import { buildRoutineContracts } from './smartComments.js';
import type {
  LocatedSmartComment,
  RegisterContractsServiceRangeContract,
  RoutineContract,
  SmartComment,
} from './types.js';

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

export interface ParsedInterfaceContracts {
  contracts: Map<string, RoutineContract>;
  serviceRanges: RegisterContractsServiceRangeContract[];
}

export function parseInterfaceContracts(
  text: string,
  file = '<register-contracts-interface>',
): Map<string, RoutineContract> {
  return parseInterfaceContractsDetailed(text, file).contracts;
}

export function parseInterfaceContractsDetailed(
  text: string,
  file = '<register-contracts-interface>',
): ParsedInterfaceContracts {
  const comments: LocatedSmartComment[] = [];
  const serviceAliases = new Map<string, string[]>();
  const serviceRanges = new Map<string, RegisterContractsServiceRangeContract>();
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
    if (comment.kind === 'extern') {
      const serviceAliasesForComment = parseInterfaceServiceAliases(trimmed);
      if (serviceAliasesForComment !== undefined) {
        serviceAliases.set(comment.name, serviceAliasesForComment);
      }
      const serviceRangeForComment = parseInterfaceServiceRange(trimmed);
      if (serviceRangeForComment !== undefined) {
        serviceRanges.set(comment.name, serviceRangeForComment.range);
      }
    }
    comments.push({ file, line: index + 1, comment });
  }
  const routines = buildRoutineContracts(comments);
  for (const [primary, aliases] of serviceAliases) {
    const contract = routines.get(primary);
    if (contract === undefined) continue;
    for (const alias of aliases) {
      routines.set(alias, { ...contract, name: alias });
    }
  }
  const out = new Map<string, RoutineContract>();
  for (const [name, contract] of routines) {
    if (hasContractContent(contract)) out.set(name, contract);
  }
  return {
    contracts: out,
    serviceRanges: [...serviceRanges.values()].filter((range) => out.has(range.target)),
  };
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
  const service = parseInterfaceService(trimmed);
  if (service !== undefined) return { kind: 'extern', name: service.primary };
  const extern = /^extern\s+(\S+)\s*$/i.exec(trimmed);
  if (extern !== null) return { kind: 'extern', name: extern[1]! };
  return /^end\s*$/i.test(trimmed) ? { kind: 'end' } : undefined;
}

function parseInterfaceServiceAliases(trimmed: string): string[] | undefined {
  return parseInterfaceService(trimmed)?.aliases;
}

function parseInterfaceService(trimmed: string): { primary: string; aliases: string[] } | undefined {
  const range = parseInterfaceServiceRange(trimmed);
  if (range !== undefined) return { primary: range.primary, aliases: range.aliases };
  const match = /^service\s+rst\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(\S+))?\s*$/i.exec(trimmed);
  if (match === null) return undefined;
  const vector = parseInterfaceNumber(match[1]!);
  const selector = match[2]!.toUpperCase();
  const value = parseInterfaceNumber(match[3]!);
  if (vector === undefined || value === undefined || selector !== 'C') return undefined;
  const primary = rstServiceTargetName(vector, String(value));
  const name = match[4];
  const aliases = name === undefined ? [] : [rstServiceTargetName(vector, name)];
  return { primary, aliases };
}

function parseInterfaceServiceRange(
  trimmed: string,
):
  | {
      primary: string;
      aliases: string[];
      range: RegisterContractsServiceRangeContract;
    }
  | undefined {
  const match =
    /^service\s+rst\s+(\S+)\s+(\S+)\s+>=\s*(\S+)(?:\s+(\S+))?\s*$/i.exec(trimmed);
  if (match === null) return undefined;
  const vector = parseInterfaceNumber(match[1]!);
  const selector = match[2]!.toUpperCase();
  const min = parseInterfaceNumber(match[3]!);
  if (vector === undefined || min === undefined || selector !== 'C') return undefined;
  const primary = rstServiceRangeTargetName(vector, min);
  const explicitName = match[4];
  const aliases = explicitName === undefined ? [] : [explicitName];
  return {
    primary,
    aliases,
    range: {
      vector,
      selector: 'C',
      min,
      target: explicitName ?? primary,
    },
  };
}

function rstServiceRangeTargetName(vector: number, min: number): string {
  return `${rstTargetPrefix(vector)}:C>=$${min.toString(16).toUpperCase().padStart(2, '0')}`;
}

function rstTargetPrefix(vector: number): string {
  return `RST_$${vector.toString(16).toUpperCase().padStart(2, '0')}`;
}

function parseInterfaceNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  const value = trimmed.startsWith('$')
    ? Number.parseInt(trimmed.slice(1), 16)
    : /^0x/iu.test(trimmed)
      ? Number.parseInt(trimmed.slice(2), 16)
      : Number.parseInt(trimmed, 10);
  return Number.isInteger(value) && value >= 0 && value <= 0xff ? value : undefined;
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
