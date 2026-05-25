import { readFile } from 'node:fs/promises';

export type DirectiveAliasProfile = {
  readonly extends?: 'azm';
  readonly directiveAliases?: Readonly<Record<string, string>>;
};

export type DirectiveAliasPolicy = {
  readonly directiveAliases: ReadonlyMap<string, string>;
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

const RESERVED_LANGUAGE_HEADS = new Set(['enum', 'op', 'type', 'union', 'field', 'byte', 'word', 'addr']);

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

const BUILT_IN_DIRECTIVE_ALIASES = new Map<string, string>([
  ['ALIGN', '.align'],
  ['BINFROM', '.binfrom'],
  ['BINTO', '.binto'],
  ['CSTR', '.cstr'],
  ['DB', '.db'],
  ['DS', '.ds'],
  ['DW', '.dw'],
  ['END', '.end'],
  ['EQU', '.equ'],
  ['INCLUDE', '.include'],
  ['ISTR', '.istr'],
  ['ORG', '.org'],
  ['PSTR', '.pstr'],
]);

const DEFAULT_DIRECTIVE_ALIAS_POLICY: DirectiveAliasPolicy = {
  directiveAliases: BUILT_IN_DIRECTIVE_ALIASES,
};

export function buildDirectiveAliasPolicy(
  projectProfiles: readonly DirectiveAliasProfile[] = [],
): DirectiveAliasPolicy {
  const directiveAliases = new Map(BUILT_IN_DIRECTIVE_ALIASES);
  const baselineKeys = new Set(directiveAliases.keys());

  for (const profile of projectProfiles) {
    if (profile.extends !== undefined && profile.extends !== 'azm') {
      throw new Error(`Unsupported directive alias base "${String(profile.extends)}"`);
    }
    if (profile.extends === undefined) {
      throw new Error(`Project directive alias files must extend "azm"`);
    }
    for (const [rawKey, rawTarget] of Object.entries(profile.directiveAliases ?? {})) {
      const key = normalizeAliasKey(rawKey);
      if (!key) throw new Error(`Invalid directive alias head "${rawKey}"`);
      if (baselineKeys.has(key)) {
        throw new Error(`Directive alias "${rawKey}" conflicts with the AZM baseline`);
      }
      const lowerKey = key.toLowerCase();
      if (RESERVED_INSTRUCTION_HEADS.has(lowerKey)) {
        throw new Error(`Directive alias "${rawKey}" conflicts with a Z80 instruction`);
      }
      if (RESERVED_LANGUAGE_HEADS.has(lowerKey)) {
        throw new Error(`Directive alias "${rawKey}" conflicts with an AZM language keyword`);
      }
      const target = normalizeAliasTarget(rawTarget);
      if (!target) throw new Error(`Invalid directive alias target "${rawTarget}" for "${rawKey}"`);
      directiveAliases.set(key, target);
    }
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
  if (profile.extends !== undefined && profile.extends !== 'azm') {
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

export function normalizeDirectiveAlias(
  text: string,
  policy: DirectiveAliasPolicy = DEFAULT_DIRECTIVE_ALIAS_POLICY,
): string {
  const trimmed = text.trimStart();
  const leading = text.slice(0, text.length - trimmed.length);
  const label = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*:)\s+(.+)$/.exec(trimmed);
  if (label) {
    return `${leading}${label[1]} ${normalizeHead(label[2] ?? '', policy)}`;
  }

  const equ = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s+([A-Za-z]+)\b(.*)$/.exec(trimmed);
  if (equ && resolveDirectiveAlias(equ[2] ?? '', policy) === '.equ') {
    return `${leading}${equ[1]} .equ${equ[3] ?? ''}`;
  }

  return `${leading}${normalizeHead(trimmed, policy)}`;
}

function normalizeHead(text: string, policy: DirectiveAliasPolicy): string {
  const head = /^([A-Za-z]+)\b(.*)$/.exec(text);
  if (!head) {
    return text;
  }

  const canonical = resolveDirectiveAlias(head[1] ?? '', policy);
  if (!canonical) {
    return text;
  }

  return `${canonical}${head[2] ?? ''}`;
}

function normalizeAliasKey(key: string): string | undefined {
  const trimmed = key.trim();
  if (!/^[.]?[A-Za-z][A-Za-z0-9_]*$/.test(trimmed)) return undefined;
  return trimmed.replace(/^\./, '').toUpperCase();
}

function normalizeAliasTarget(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  const dotted = trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
  return CANONICAL_DIRECTIVES.has(dotted) ? dotted : undefined;
}

function resolveDirectiveAlias(
  head: string,
  policy: DirectiveAliasPolicy,
): string | undefined {
  const trimmed = head.trim();
  if (trimmed.startsWith('.')) {
    return CANONICAL_DIRECTIVES.has(trimmed) ? trimmed : undefined;
  }
  const key = normalizeAliasKey(head);
  if (!key) return undefined;
  return policy.directiveAliases.get(key);
}
