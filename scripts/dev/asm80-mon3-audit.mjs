#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const encodeSourcePath = resolve(repoRoot, 'src/z80/encode.ts');

const REGISTER_NAMES = new Set([
  'A',
  'B',
  'C',
  'D',
  'E',
  'H',
  'L',
  'BC',
  'DE',
  'HL',
  'SP',
  'AF',
  "AF'",
  'IX',
  'IY',
  'IXH',
  'IXL',
  'IYH',
  'IYL',
  'I',
  'R',
]);
const CONDITION_NAMES = new Set(['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M']);
const DIRECTIVE_NAMES = new Set([
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

function makeSpan(file, line) {
  return {
    file,
    start: { line, column: 1, offset: 0 },
    end: { line, column: 1, offset: 0 },
  };
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function stripComment(line) {
  let quote = undefined;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || (ch === "'" && !/[A-Za-z0-9_]/.test(line[i - 1] ?? ''))) {
      quote = ch;
      continue;
    }
    if (ch === ';') return line.slice(0, i);
  }
  return line;
}

function countOutsideStrings(line, pattern) {
  const code = stripComment(line);
  let quote = undefined;
  let count = 0;
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || (ch === "'" && !/[A-Za-z0-9_]/.test(code[i - 1] ?? ''))) {
      quote = ch;
      continue;
    }
    if (pattern(ch)) count += 1;
  }
  return count;
}

function countStringLiterals(line, quote) {
  const code = stripComment(line);
  let count = 0;
  let active = false;
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i];
    if (quote === "'" && !active && /[A-Za-z0-9_]/.test(code[i - 1] ?? '')) continue;
    if (ch === quote) {
      active = !active;
      if (active) count += 1;
    }
  }
  return count;
}

function splitOperands(text) {
  const operands = [];
  let current = '';
  let quote = undefined;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      operands.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim() !== '') operands.push(current.trim());
  return operands;
}

function parseNumber(text) {
  const trimmed = text.trim();
  if (/^[0-9][0-9a-f]*h$/i.test(trimmed)) return Number.parseInt(trimmed.slice(0, -1), 16);
  if (/^[01]+b$/i.test(trimmed)) return Number.parseInt(trimmed.slice(0, -1), 2);
  if (/^[0-9]+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  return undefined;
}

function sampleImm(text, head, operandIndex) {
  const parsed = parseNumber(text);
  if (parsed !== undefined) return parsed;
  if (head === 'jr' || head === 'djnz') return 0;
  if (head === 'rst') return 0x28;
  if (head === 'bit' || head === 'res' || head === 'set') return 3;
  if (head === 'im') return 1;
  if ((head === 'call' || head === 'jp') && operandIndex > 0) return 0x1234;
  return 0x12;
}

function immLiteral(span, value) {
  return { kind: 'ImmLiteral', span, value };
}

function immOperand(span, value) {
  return { kind: 'Imm', span, expr: immLiteral(span, value) };
}

function memName(span, name) {
  return { kind: 'Mem', span, expr: { kind: 'EaName', span, name } };
}

function memIndexed(span, base, disp) {
  return {
    kind: 'Mem',
    span,
    expr: {
      kind: disp < 0 ? 'EaSub' : 'EaAdd',
      span,
      base: { kind: 'EaName', span, name: base },
      offset: immLiteral(span, Math.abs(disp)),
    },
  };
}

function parseOperand(token, head, operandIndex, span) {
  const trimmed = token.trim();
  const upper = trimmed.toUpperCase();
  if (REGISTER_NAMES.has(upper) || CONDITION_NAMES.has(upper))
    return { kind: 'Reg', span, name: upper };

  const paren = trimmed.match(/^\((.*)\)$/);
  if (paren) {
    const inner = paren[1].trim();
    const innerUpper = inner.toUpperCase();
    if ((head === 'in' && operandIndex === 1) || (head === 'out' && operandIndex === 0)) {
      if (innerUpper === 'C') return { kind: 'PortC', span };
      return {
        kind: 'PortImm8',
        span,
        expr: immLiteral(span, sampleImm(inner, head, operandIndex)),
      };
    }
    if (['HL', 'BC', 'DE', 'SP', 'IX', 'IY'].includes(innerUpper)) return memName(span, innerUpper);
    const indexed = inner.match(/^(ix|iy)\s*([+-])\s*(.+)$/i);
    if (indexed) {
      const disp = sampleImm(indexed[3], head, operandIndex);
      return memIndexed(span, indexed[1].toUpperCase(), indexed[2] === '-' ? -disp : disp);
    }
    return { kind: 'Mem', span, expr: { kind: 'EaImm', span, expr: immLiteral(span, 0x1234) } };
  }

  return immOperand(span, sampleImm(trimmed, head, operandIndex));
}

function normalizeOperand(token, head, operandIndex) {
  const trimmed = token.trim();
  const upper = trimmed.toUpperCase();
  if (REGISTER_NAMES.has(upper) || CONDITION_NAMES.has(upper)) return upper.toLowerCase();
  const paren = trimmed.match(/^\((.*)\)$/);
  if (!paren) return 'n';
  const inner = paren[1].trim();
  const innerUpper = inner.toUpperCase();
  if ((head === 'in' && operandIndex === 1) || (head === 'out' && operandIndex === 0)) {
    if (innerUpper === 'C') return '(c)';
    return '(n)';
  }
  if (['HL', 'BC', 'DE', 'SP', 'IX', 'IY'].includes(innerUpper))
    return `(${innerUpper.toLowerCase()})`;
  const indexed = inner.match(/^(ix|iy)\s*([+-])\s*(.+)$/i);
  if (indexed) return `(${indexed[1].toLowerCase()}${indexed[2]}d)`;
  return '(nn)';
}

function parseKnownHeads() {
  const src = readFileSync(encodeSourcePath, 'utf8');
  const heads = new Set();
  for (const match of src.matchAll(/case '([a-z][a-z0-9-]*)':/g)) {
    const mnemonic = match[1];
    if (mnemonic === 'ld-a-imm') {
      heads.add('ld');
      continue;
    }
    if (mnemonic === 'jp-indirect') {
      heads.add('jp');
      continue;
    }
    const sourceHead = mnemonic.split('-')[0];
    heads.add(sourceHead);
  }
  return heads;
}

function parseLogicalLine(rawLine) {
  let text = stripComment(rawLine).trim();
  if (text === '') return undefined;

  const colonLabel = text.match(/^([A-Za-z_.$?][A-Za-z0-9_.$?]*):\s*(.*)$/);
  if (colonLabel) text = colonLabel[2].trim();
  if (text === '') return { kind: 'label' };

  const bareEqu = text.match(/^([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s+(\.[A-Za-z][A-Za-z0-9_]*)\b(.*)$/);
  if (bareEqu && bareEqu[2].toLowerCase() === '.equ')
    return { kind: 'directive', directive: '.equ' };

  const directive = text.match(/^(\.[A-Za-z][A-Za-z0-9_]*)\b(.*)$/);
  if (directive)
    return { kind: 'directive', directive: directive[1].toLowerCase(), rest: directive[2].trim() };

  const instruction = text.match(/^([A-Za-z][A-Za-z0-9_]*)\b(.*)$/);
  if (!instruction) return undefined;
  return {
    kind: 'instruction',
    head: instruction[1].toLowerCase(),
    operandText: instruction[2].trim(),
    text,
  };
}

function scanFile(file, state) {
  const absFile = resolve(file);
  if (state.seen.has(absFile)) return;
  state.seen.add(absFile);
  state.files.push(absFile);

  const lines = readFileSync(absFile, 'utf8').split(/\r?\n/);
  let ended = false;
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    state.currentLocationExpressionCount += countOutsideStrings(rawLine, (ch) => ch === '$');
    state.singleQuotedStringExpressionCount += countStringLiterals(rawLine, "'");
    state.doubleQuotedStringExpressionCount += countStringLiterals(rawLine, '"');

    const parsed = parseLogicalLine(rawLine);
    if (!parsed) continue;

    if (parsed.kind === 'directive') {
      increment(state.directiveCounts, parsed.directive);
      if (parsed.directive === '.end') {
        ended = true;
        continue;
      }
      if (ended && parsed.directive !== '.binfrom') continue;
      if (parsed.directive === '.include') {
        const includeMatch = parsed.rest.match(/^"([^"]+)"/);
        if (includeMatch) scanFile(resolve(dirname(absFile), includeMatch[1]), state);
      }
      if (!DIRECTIVE_NAMES.has(parsed.directive)) state.unknownDirectives.add(parsed.directive);
      continue;
    }
    if (ended || parsed.kind !== 'instruction') continue;

    increment(state.instructionHeadCounts, parsed.head);
    const operands = splitOperands(parsed.operandText);
    const form = `${parsed.head}${operands.length > 0 ? ` ${operands.map((op, opIndex) => normalizeOperand(op, parsed.head, opIndex)).join(',')}` : ''}`;
    const record = state.forms.get(form) ?? {
      form,
      head: parsed.head,
      operands,
      count: 0,
      example: { file: absFile, line: index + 1, text: parsed.text },
    };
    record.count += 1;
    state.forms.set(form, record);
  }
}

async function unsupportedForms(forms, knownHeads) {
  const encodePath = resolve(repoRoot, 'dist/src/z80/encode.js');
  const parsePath = resolve(repoRoot, 'dist/src/z80/parse-instruction.js');
  if (!existsSync(encodePath) || !existsSync(parsePath)) {
    throw new Error('Build required before MON3 audit: npm run build');
  }
  const [{ encodeZ80Instruction }, { parseZ80Instruction }] = await Promise.all([
    import(pathToFileURL(encodePath).href),
    import(pathToFileURL(parsePath).href),
  ]);
  const unsupported = [];
  for (const form of forms.values()) {
    if (!knownHeads.has(form.head)) continue;
    const parsed = parseZ80Instruction(form.example.text);
    if (!parsed || parsed.error || !parsed.instruction) {
      unsupported.push({
        form: form.form,
        count: form.count,
        diagnostic: parsed?.error ?? 'parser returned undefined',
        example: form.example,
      });
      continue;
    }
    try {
      encodeZ80Instruction(parsed.instruction);
    } catch (error) {
      unsupported.push({
        form: form.form,
        count: form.count,
        diagnostic: error instanceof Error ? error.message : String(error),
        example: form.example,
      });
    }
  }
  return unsupported.sort((a, b) => a.form.localeCompare(b.form));
}

function mapToObject(map) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function formatText(audit, entry) {
  const rel = (file) => relative(dirname(resolve(entry)), file) || file;
  const lines = [];
  lines.push(`MON3 audit entry: ${entry}`);
  lines.push(`Files (${audit.files.length}):`);
  for (const file of audit.files) lines.push(`  ${rel(file)}`);
  lines.push('');
  lines.push('Directive counts:');
  for (const [name, count] of Object.entries(audit.directiveCounts))
    lines.push(`  ${name}: ${count}`);
  lines.push('');
  lines.push('Instruction head counts:');
  for (const [name, count] of Object.entries(audit.instructionHeadCounts))
    lines.push(`  ${name}: ${count}`);
  lines.push('');
  lines.push(
    `Unknown heads: ${audit.unknownHeads.length > 0 ? audit.unknownHeads.join(', ') : 'none'}`,
  );
  lines.push(
    `Unknown directives: ${audit.unknownDirectives.length > 0 ? audit.unknownDirectives.join(', ') : 'none'}`,
  );
  lines.push(`Current-location $ expression count: ${audit.currentLocationExpressionCount}`);
  lines.push(`Single-quoted string expression count: ${audit.singleQuotedStringExpressionCount}`);
  lines.push(`Double-quoted string expression count: ${audit.doubleQuotedStringExpressionCount}`);
  lines.push('');
  lines.push(`Unsupported encoder forms (${audit.unsupportedForms.length}):`);
  for (const gap of audit.unsupportedForms) {
    lines.push(
      `  ${gap.form} x${gap.count}: ${gap.diagnostic} (${rel(gap.example.file)}:${gap.example.line})`,
    );
  }
  if (audit.unsupportedForms.length === 0) lines.push('  none');
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const entry = args.find((arg) => arg !== '--json');
  if (!entry) {
    console.error('Usage: node scripts/dev/asm80-mon3-audit.mjs [--json] /path/to/mon3.z80');
    process.exitCode = 2;
    return;
  }
  const knownHeads = parseKnownHeads();
  const state = {
    seen: new Set(),
    files: [],
    directiveCounts: new Map(),
    instructionHeadCounts: new Map(),
    unknownDirectives: new Set(),
    forms: new Map(),
    currentLocationExpressionCount: 0,
    singleQuotedStringExpressionCount: 0,
    doubleQuotedStringExpressionCount: 0,
  };
  scanFile(entry, state);

  const headCounts = mapToObject(state.instructionHeadCounts);
  const unknownHeads = Object.keys(headCounts).filter((head) => !knownHeads.has(head));
  const audit = {
    files: state.files,
    directiveCounts: mapToObject(state.directiveCounts),
    instructionHeadCounts: headCounts,
    unknownHeads,
    unknownDirectives: [...state.unknownDirectives].sort(),
    currentLocationExpressionCount: state.currentLocationExpressionCount,
    singleQuotedStringExpressionCount: state.singleQuotedStringExpressionCount,
    doubleQuotedStringExpressionCount: state.doubleQuotedStringExpressionCount,
    unsupportedForms: await unsupportedForms(state.forms, knownHeads),
  };

  if (json) console.log(JSON.stringify(audit, null, 2));
  else console.log(formatText(audit, entry));
}

await main();
