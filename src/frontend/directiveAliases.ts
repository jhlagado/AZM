import { readFile } from 'node:fs/promises';

export type DirectiveAliasProfileName = 'azm';

export type DirectiveAliasProfile = {
  name?: string;
  extends?: DirectiveAliasProfileName;
  directiveAliases?: Record<string, string>;
};

export type DirectiveAliasPolicy = {
  directiveAliases: Map<string, string>;
};

const RESERVED_INSTRUCTION_HEADS = new Set([
  'adc',
  'add',
  'and',
  'bit',
  'call',
  'ccf',
  'cp',
  'cpd',
  'cpdr',
  'cpi',
  'cpir',
  'cpl',
  'daa',
  'dec',
  'di',
  'djnz',
  'ei',
  'ex',
  'exx',
  'halt',
  'im',
  'in',
  'inc',
  'ind',
  'indr',
  'ini',
  'inir',
  'jp',
  'jr',
  'ld',
  'ldd',
  'lddr',
  'ldi',
  'ldir',
  'neg',
  'nop',
  'or',
  'otdr',
  'otir',
  'out',
  'outd',
  'outi',
  'pop',
  'push',
  'res',
  'ret',
  'reti',
  'retn',
  'rl',
  'rla',
  'rlc',
  'rlca',
  'rld',
  'rr',
  'rra',
  'rrc',
  'rrca',
  'rrd',
  'rst',
  'sbc',
  'scf',
  'set',
  'sla',
  'sll',
  'sra',
  'srl',
  'sub',
  'xor',
]);

const CANONICAL_DIRECTIVES = new Set([
  '.align',
  '.binfrom',
  '.binto',
  '.cstr',
  '.db',
  '.ds',
  '.dw',
  '.end',
  '.equ',
  '.include',
  '.istr',
  '.org',
  '.pstr',
]);

const BUILTIN_PROFILES: Record<DirectiveAliasProfileName, DirectiveAliasProfile> = {
  azm: {
    name: 'azm',
    directiveAliases: {
      ALIGN: '.align',
      BINFROM: '.binfrom',
      BINTO: '.binto',
      CSTR: '.cstr',
      DB: '.db',
      DS: '.ds',
      DW: '.dw',
      END: '.end',
      EQU: '.equ',
      INCLUDE: '.include',
      ISTR: '.istr',
      ORG: '.org',
      PSTR: '.pstr',
    },
  },
};

export function defaultDirectiveAliasProfileName(): DirectiveAliasProfileName {
  return 'azm';
}

function normalizeAliasKey(key: string): string | undefined {
  const trimmed = key.trim();
  if (!/^[.]?[A-Za-z][A-Za-z0-9_]*$/.test(trimmed)) return undefined;
  return trimmed.replace(/^\./, '').toLowerCase();
}

function normalizeAliasTarget(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  const dotted = trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
  if (!CANONICAL_DIRECTIVES.has(dotted)) return undefined;
  return dotted;
}

function mergeProfile(
  profile: DirectiveAliasProfile,
  out: Map<string, string>,
  seen: Set<string>,
  source: 'builtin' | 'project',
  baselineKeys: ReadonlySet<string> = new Set(),
): void {
  if (profile.extends) {
    if (seen.has(profile.extends)) {
      throw new Error(`Directive alias profile cycle at "${profile.extends}"`);
    }
    seen.add(profile.extends);
    mergeProfile(BUILTIN_PROFILES[profile.extends], out, seen, 'builtin', baselineKeys);
    seen.delete(profile.extends);
  }

  for (const [rawKey, rawTarget] of Object.entries(profile.directiveAliases ?? {})) {
    const key = normalizeAliasKey(rawKey);
    if (!key) throw new Error(`Invalid directive alias head "${rawKey}"`);
    if (source === 'project') {
      if (baselineKeys.has(key)) {
        throw new Error(`Directive alias "${rawKey}" conflicts with the AZM baseline`);
      }
      if (RESERVED_INSTRUCTION_HEADS.has(key)) {
        throw new Error(`Directive alias "${rawKey}" conflicts with a Z80 instruction`);
      }
    }
    const target = normalizeAliasTarget(rawTarget);
    if (!target) throw new Error(`Invalid directive alias target "${rawTarget}" for "${rawKey}"`);
    out.set(key, target);
  }
}

export function buildDirectiveAliasPolicy(
  profileName: DirectiveAliasProfileName,
  projectProfiles: DirectiveAliasProfile[] = [],
): DirectiveAliasPolicy {
  const directiveAliases = new Map<string, string>();
  mergeProfile(BUILTIN_PROFILES[profileName], directiveAliases, new Set([profileName]), 'builtin');
  const baselineKeys = new Set(directiveAliases.keys());
  for (const profile of projectProfiles) {
    mergeProfile(profile, directiveAliases, new Set(), 'project', baselineKeys);
  }
  return { directiveAliases };
}

export async function readDirectiveAliasProfile(path: string): Promise<DirectiveAliasProfile> {
  const text = await readFile(path, 'utf8');
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Directive alias file "${path}" must contain a JSON object`);
  }
  const profile = parsed as DirectiveAliasProfile;
  if (
    profile.extends !== undefined &&
    profile.extends !== 'azm'
  ) {
    throw new Error(`Unsupported directive alias base "${String(profile.extends)}" in "${path}"`);
  }
  if (
    profile.directiveAliases !== undefined &&
    (!profile.directiveAliases ||
      typeof profile.directiveAliases !== 'object' ||
      Array.isArray(profile.directiveAliases))
  ) {
    throw new Error(`Directive alias file "${path}" has invalid "directiveAliases"`);
  }
  return profile;
}

export function resolveDirectiveAlias(
  head: string,
  policy: DirectiveAliasPolicy | undefined,
): string | undefined {
  const normalized = normalizeAliasKey(head);
  if (!normalized) return undefined;
  const dotted = `.${normalized}`;
  if (head.trim().startsWith('.') && CANONICAL_DIRECTIVES.has(dotted)) return dotted;
  return policy?.directiveAliases.get(normalized);
}
