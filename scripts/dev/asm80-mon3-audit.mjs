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
const SAMPLE_IMMEDIATE_BY_HEAD = new Map([
  ['djnz', 0],
  ['jr', 0],
  ['rst', 0x28],
  ['bit', 3],
  ['res', 3],
  ['set', 3],
  ['im', 1],
]);
const ADDRESS_IMMEDIATE_HEADS = new Set(['call', 'jp']);
const MEMORY_REGISTER_NAMES = new Set(['HL', 'BC', 'DE', 'SP', 'IX', 'IY']);

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

function isQuoteStart(text, index, quote) {
  return quote !== "'" || !/[A-Za-z0-9_]/.test(text[index - 1] ?? '');
}

function scanCode(line, onCodeChar) {
  const state = { quote: undefined };
  for (let i = 0; i < line.length; i += 1) {
    const result = scanCodeChar(line, i, state, onCodeChar);
    if (result !== undefined) return result;
  }
  return undefined;
}

function scanCodeChar(line, index, state, onCodeChar) {
  const ch = line[index];
  if (consumeQuotedCodeChar(state, ch)) return undefined;
  if (startCodeQuote(line, index, state, ch)) return undefined;
  return onCodeChar(ch, index);
}

function consumeQuotedCodeChar(state, ch) {
  if (!state.quote) return false;
  if (ch === state.quote) state.quote = undefined;
  return true;
}

function startCodeQuote(line, index, state, ch) {
  if ((ch !== '"' && ch !== "'") || !isQuoteStart(line, index, ch)) return false;
  state.quote = ch;
  return true;
}

function stripComment(line) {
  const commentStart = scanCode(line, (ch, index) => (ch === ';' ? index : undefined));
  if (commentStart !== undefined) return line.slice(0, commentStart);
  return line;
}

function countOutsideStrings(line, pattern) {
  const code = stripComment(line);
  let count = 0;
  scanCode(code, (ch) => {
    if (pattern(ch)) count += 1;
    return undefined;
  });
  return count;
}

function countStringLiterals(line, quote) {
  const code = stripComment(line);
  let count = 0;
  let active = false;
  for (let i = 0; i < code.length; i += 1) {
    if (isLiteralQuoteToggle(code, i, quote, active)) {
      active = !active;
      if (active) count += 1;
    }
  }
  return count;
}

function isLiteralQuoteToggle(code, index, quote, active) {
  return code[index] === quote && (active || isQuoteStart(code, index, quote));
}

function splitOperands(text) {
  const state = { operands: [], current: '', quote: undefined, depth: 0 };
  for (let i = 0; i < text.length; i += 1) {
    scanOperandChar(state, text[i]);
  }
  finishOperand(state);
  return state.operands;
}

function scanOperandChar(state, ch) {
  if (appendQuotedOperandChar(state, ch)) return;
  if (startOperandQuote(state, ch)) return;
  updateOperandDepth(state, ch);
  if (splitOperandAtComma(state, ch)) return;
  state.current += ch;
}

function appendQuotedOperandChar(state, ch) {
  if (!state.quote) return false;
  state.current += ch;
  if (ch === state.quote) state.quote = undefined;
  return true;
}

function startOperandQuote(state, ch) {
  if (ch !== '"' && ch !== "'") return false;
  state.quote = ch;
  state.current += ch;
  return true;
}

function updateOperandDepth(state, ch) {
  if (ch === '(') state.depth += 1;
  if (ch === ')') state.depth -= 1;
}

function splitOperandAtComma(state, ch) {
  if (ch !== ',' || state.depth !== 0) return false;
  finishOperand(state);
  state.current = '';
  return true;
}

function finishOperand(state) {
  if (state.current.trim() !== '') state.operands.push(state.current.trim());
}

function parseNumber(text) {
  const trimmed = text.trim();
  if (/^[0-9][0-9a-f]*h$/i.test(trimmed)) return Number.parseInt(trimmed.slice(0, -1), 16);
  if (/^[01]+b$/i.test(trimmed)) return Number.parseInt(trimmed.slice(0, -1), 2);
  if (/^[0-9]+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  return undefined;
}

function sampleImm(text, head, operandIndex) {
  return parseNumber(text) ?? sampleFallbackImm(head, operandIndex);
}

function sampleFallbackImm(head, operandIndex) {
  return SAMPLE_IMMEDIATE_BY_HEAD.get(head) ?? sampleDefaultImm(head, operandIndex);
}

function sampleDefaultImm(head, operandIndex) {
  return ADDRESS_IMMEDIATE_HEADS.has(head) && operandIndex > 0 ? 0x1234 : 0x12;
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
  const register = parseRegisterOperand(trimmed, span);
  if (register) return register;

  const paren = trimmed.match(/^\((.*)\)$/);
  if (paren) return parseParenthesizedOperand(paren[1].trim(), head, operandIndex, span);

  return immOperand(span, sampleImm(trimmed, head, operandIndex));
}

function parseRegisterOperand(text, span) {
  const upper = text.toUpperCase();
  if (!REGISTER_NAMES.has(upper) && !CONDITION_NAMES.has(upper)) return undefined;
  return { kind: 'Reg', span, name: upper };
}

function parseParenthesizedOperand(inner, head, operandIndex, span) {
  if (isPortOperandPosition(head, operandIndex)) return parsePortOperand(inner, head, operandIndex, span);
  const innerUpper = inner.toUpperCase();
  if (MEMORY_REGISTER_NAMES.has(innerUpper)) return memName(span, innerUpper);
  return parseIndexedOperand(inner, head, operandIndex, span) ?? memImmediate(span);
}

function isPortOperandPosition(head, operandIndex) {
  return (head === 'in' && operandIndex === 1) || (head === 'out' && operandIndex === 0);
}

function parsePortOperand(inner, head, operandIndex, span) {
  if (inner.toUpperCase() === 'C') return { kind: 'PortC', span };
  return {
    kind: 'PortImm8',
    span,
    expr: immLiteral(span, sampleImm(inner, head, operandIndex)),
  };
}

function parseIndexedOperand(inner, head, operandIndex, span) {
  const indexed = inner.match(/^(ix|iy)\s*([+-])\s*(.+)$/i);
  if (!indexed) return undefined;
  const disp = sampleImm(indexed[3], head, operandIndex);
  return memIndexed(span, indexed[1].toUpperCase(), indexed[2] === '-' ? -disp : disp);
}

function memImmediate(span) {
  return { kind: 'Mem', span, expr: { kind: 'EaImm', span, expr: immLiteral(span, 0x1234) } };
}

function normalizeOperand(token, head, operandIndex) {
  const trimmed = token.trim();
  const register = normalizeRegisterOperand(trimmed);
  if (register) return register;
  const paren = trimmed.match(/^\((.*)\)$/);
  if (!paren) return 'n';
  return normalizeParenthesizedOperand(paren[1].trim(), head, operandIndex);
}

function normalizeRegisterOperand(text) {
  const upper = text.toUpperCase();
  if (!REGISTER_NAMES.has(upper) && !CONDITION_NAMES.has(upper)) return undefined;
  return upper.toLowerCase();
}

function normalizeParenthesizedOperand(inner, head, operandIndex) {
  const innerUpper = inner.toUpperCase();
  const port = normalizePortOperand(innerUpper, head, operandIndex);
  if (port) return port;
  const memoryRegister = normalizeMemoryRegisterOperand(innerUpper);
  if (memoryRegister) return memoryRegister;
  return normalizeIndexedOperand(inner) ?? '(nn)';
}

function normalizePortOperand(innerUpper, head, operandIndex) {
  if (!isPortOperandPosition(head, operandIndex)) return undefined;
  return innerUpper === 'C' ? '(c)' : '(n)';
}

function normalizeMemoryRegisterOperand(innerUpper) {
  if (!MEMORY_REGISTER_NAMES.has(innerUpper)) return undefined;
  return `(${innerUpper.toLowerCase()})`;
}

function normalizeIndexedOperand(inner) {
  const indexed = inner.match(/^(ix|iy)\s*([+-])\s*(.+)$/i);
  if (!indexed) return undefined;
  return `(${indexed[1].toLowerCase()}${indexed[2]}d)`;
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
  const text = stripLeadingLabel(stripComment(rawLine).trim());
  if (text === '') return undefined;

  return parseDirectiveLine(text) ?? parseInstructionLine(text);
}

function stripLeadingLabel(text) {
  const colonLabel = text.match(/^([A-Za-z_.$?][A-Za-z0-9_.$?]*):\s*(.*)$/);
  return colonLabel ? colonLabel[2].trim() : text;
}

function parseDirectiveLine(text) {
  if (text === '') return { kind: 'label' };
  if (isBareEquLine(text)) return { kind: 'directive', directive: '.equ' };

  const directive = text.match(/^(\.[A-Za-z][A-Za-z0-9_]*)\b(.*)$/);
  if (directive)
    return { kind: 'directive', directive: directive[1].toLowerCase(), rest: directive[2].trim() };
  return undefined;
}

function isBareEquLine(text) {
  return bareDirectiveHead(text)?.toLowerCase() === '.equ';
}

function bareDirectiveHead(text) {
  return text.match(/^([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s+(\.[A-Za-z][A-Za-z0-9_]*)\b(.*)$/)?.[2];
}

function parseInstructionLine(text) {
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
  recordScannedFile(state, absFile);

  const lines = readFileSync(absFile, 'utf8').split(/\r?\n/);
  let ended = false;
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    recordLineCounts(state, rawLine);

    const parsed = parseLogicalLine(rawLine);
    if (!parsed) continue;

    ended = scanParsedLine(parsed, absFile, index + 1, state, ended);
  }
}

function recordScannedFile(state, absFile) {
  state.seen.add(absFile);
  state.files.push(absFile);
}

function recordLineCounts(state, rawLine) {
  state.currentLocationExpressionCount += countOutsideStrings(rawLine, (ch) => ch === '$');
  state.singleQuotedStringExpressionCount += countStringLiterals(rawLine, "'");
  state.doubleQuotedStringExpressionCount += countStringLiterals(rawLine, '"');
}

function scanParsedLine(parsed, absFile, line, state, ended) {
  if (parsed.kind === 'directive') return scanDirective(parsed, absFile, state, ended);
  if (ended || parsed.kind !== 'instruction') return ended;
  scanInstruction(parsed, absFile, line, state);
  return ended;
}

function scanDirective(parsed, absFile, state, ended) {
  increment(state.directiveCounts, parsed.directive);
  if (isEndDirective(parsed)) return true;
  if (isIgnoredAfterEndDirective(parsed, ended)) return ended;
  scanIncludeDirective(parsed, absFile, state);
  if (!DIRECTIVE_NAMES.has(parsed.directive)) state.unknownDirectives.add(parsed.directive);
  return ended;
}

function isEndDirective(parsed) {
  return parsed.directive === '.end';
}

function isIgnoredAfterEndDirective(parsed, ended) {
  return ended && parsed.directive !== '.binfrom';
}

function scanIncludeDirective(parsed, absFile, state) {
  if (parsed.directive !== '.include') return;
  const includeMatch = parsed.rest.match(/^"([^"]+)"/);
  if (includeMatch) scanFile(resolve(dirname(absFile), includeMatch[1]), state);
}

function scanInstruction(parsed, absFile, line, state) {
  increment(state.instructionHeadCounts, parsed.head);
  const operands = splitOperands(parsed.operandText);
  const form = normalizedInstructionForm(parsed.head, operands);
  const record = state.forms.get(form) ?? makeInstructionFormRecord(form, parsed, operands, absFile, line);
  record.count += 1;
  state.forms.set(form, record);
}

function normalizedInstructionForm(head, operands) {
  if (operands.length === 0) return head;
  return `${head} ${operands.map((op, opIndex) => normalizeOperand(op, head, opIndex)).join(',')}`;
}

function makeInstructionFormRecord(form, parsed, operands, absFile, line) {
  return {
    form,
    head: parsed.head,
    operands,
    count: 0,
    example: { file: absFile, line, text: parsed.text },
  };
}

async function unsupportedForms(forms, knownHeads) {
  const { encodeZ80Instruction, parseZ80Instruction } = await loadBuiltAssembler();
  const unsupported = [];
  for (const form of forms.values()) {
    if (!knownHeads.has(form.head)) continue;
    const unsupportedForm = unsupportedFormFor(form, parseZ80Instruction, encodeZ80Instruction);
    if (unsupportedForm) unsupported.push(unsupportedForm);
  }
  return unsupported.sort((a, b) => a.form.localeCompare(b.form));
}

async function loadBuiltAssembler() {
  const encodePath = resolve(repoRoot, 'dist/src/z80/encode.js');
  const parsePath = resolve(repoRoot, 'dist/src/z80/parse-instruction.js');
  assertBuiltAssemblerExists(encodePath, parsePath);
  const [{ encodeZ80Instruction }, { parseZ80Instruction }] = await Promise.all([
    import(pathToFileURL(encodePath).href),
    import(pathToFileURL(parsePath).href),
  ]);
  return { encodeZ80Instruction, parseZ80Instruction };
}

function assertBuiltAssemblerExists(encodePath, parsePath) {
  if (!existsSync(encodePath) || !existsSync(parsePath)) {
    throw new Error('Build required before MON3 audit: npm run build');
  }
}

function unsupportedFormFor(form, parseZ80Instruction, encodeZ80Instruction) {
  const parsed = parseZ80Instruction(form.example.text);
  const parseDiagnostic = parsedFormDiagnostic(parsed);
  if (parseDiagnostic) return unsupportedFormRecord(form, parseDiagnostic);
  return unsupportedEncodedForm(form, parsed.instruction, encodeZ80Instruction);
}

function parsedFormDiagnostic(parsed) {
  if (!parsed) return 'parser returned undefined';
  if (parsed.error) return parsed.error;
  if (!parsed.instruction) return 'parser returned undefined';
  return undefined;
}

function unsupportedEncodedForm(form, instruction, encodeZ80Instruction) {
  try {
    encodeZ80Instruction(instruction);
    return undefined;
  } catch (error) {
    return unsupportedFormRecord(form, error instanceof Error ? error.message : String(error));
  }
}

function unsupportedFormRecord(form, diagnostic) {
  return {
    form: form.form,
    count: form.count,
    diagnostic,
    example: form.example,
  };
}

function mapToObject(map) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function formatText(audit, entry) {
  const rel = (file) => relative(dirname(resolve(entry)), file) || file;
  const lines = [];
  lines.push(`MON3 audit entry: ${entry}`);
  appendFileSection(lines, audit.files, rel);
  appendCountSection(lines, 'Directive counts:', audit.directiveCounts);
  appendCountSection(lines, 'Instruction head counts:', audit.instructionHeadCounts);
  appendUnknownSection(lines, audit);
  appendExpressionCountSection(lines, audit);
  appendUnsupportedSection(lines, audit.unsupportedForms, rel);
  return lines.join('\n');
}

function appendFileSection(lines, files, rel) {
  lines.push(`Files (${files.length}):`);
  for (const file of files) lines.push(`  ${rel(file)}`);
  lines.push('');
}

function appendCountSection(lines, title, counts) {
  lines.push(title);
  for (const [name, count] of Object.entries(counts)) lines.push(`  ${name}: ${count}`);
  lines.push('');
}

function appendUnknownSection(lines, audit) {
  lines.push(`Unknown heads: ${formatList(audit.unknownHeads)}`);
  lines.push(`Unknown directives: ${formatList(audit.unknownDirectives)}`);
}

function formatList(values) {
  return values.length > 0 ? values.join(', ') : 'none';
}

function appendExpressionCountSection(lines, audit) {
  lines.push(`Current-location $ expression count: ${audit.currentLocationExpressionCount}`);
  lines.push(`Single-quoted string expression count: ${audit.singleQuotedStringExpressionCount}`);
  lines.push(`Double-quoted string expression count: ${audit.doubleQuotedStringExpressionCount}`);
  lines.push('');
}

function appendUnsupportedSection(lines, unsupportedForms, rel) {
  lines.push(`Unsupported encoder forms (${unsupportedForms.length}):`);
  for (const gap of unsupportedForms) lines.push(formatUnsupportedForm(gap, rel));
  if (unsupportedForms.length === 0) lines.push('  none');
}

function formatUnsupportedForm(gap, rel) {
  return `  ${gap.form} x${gap.count}: ${gap.diagnostic} (${rel(gap.example.file)}:${gap.example.line})`;
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
