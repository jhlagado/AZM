import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const FORBIDDEN_RULES = [
  {
    id: 'bare-data-marker',
    pattern: /^\s*data\s*$/i,
    message: 'Bare `data` marker lines are forbidden; use labels plus .db/.dw/.ds.',
  },
  {
    id: 'removed-data-decl',
    pattern: /^\s*(?:export\s+)?data\s+[A-Za-z_][A-Za-z0-9_]*\b/i,
    message: '`data` declarations are forbidden; use labels plus .db/.dw/.ds.',
  },
  {
    id: 'removed-globals-block',
    pattern: /^\s*globals\b/i,
    message: '`globals ... end` is forbidden; use labels plus .db/.dw/.ds.',
  },
  {
    id: 'removed-active-counter-section',
    pattern: /^\s*section\s+(?:code|data|var)\b/i,
    message: 'Active-counter section directives are forbidden; use .org, labels, and .db/.dw/.ds.',
  },
  {
    id: 'removed-function-decl',
    pattern: /^\s*(?:export\s+)?func\s+[A-Za-z_][A-Za-z0-9_]*\b/i,
    message: '`func` declarations are forbidden; use labels and explicit Z80 instructions.',
  },
  {
    id: 'removed-module-import',
    pattern: /^\s*(?:module|import)\b/i,
    message: '`module`/`import` declarations are forbidden; use textual .include.',
  },
  {
    id: 'removed-var-decl',
    pattern: /^\s*(?:export\s+)?var\s+[A-Za-z_][A-Za-z0-9_]*\b/i,
    message: '`var` declarations are forbidden; use labels plus .db/.dw/.ds.',
  },
  {
    id: 'removed-let-decl',
    pattern: /^\s*(?:export\s+)?let\s+[A-Za-z_][A-Za-z0-9_]*\b/i,
    message: '`let` declarations are forbidden; use labels plus .equ/.db/.dw/.ds.',
  },
  {
    id: 'removed-local-arg-decl',
    pattern: /^\s*(?:local|arg|argument)\s+[A-Za-z_][A-Za-z0-9_]*\b/i,
    message: 'Local/argument declarations are forbidden; use explicit registers, stack, and labels.',
  },
  {
    id: 'removed-extern-func',
    pattern: /^\s*extern\s+func\b/i,
    message: '`extern func` declarations are forbidden; use .asmi register-contracts interfaces.',
  },
  {
    id: 'removed-typed-assignment',
    pattern: /:=/,
    message: '`:=` typed assignment is forbidden; write explicit Z80 instructions.',
  },
  {
    id: 'top-level-const-decl',
    pattern: /^\s*(?:export\s+)?const\s+[A-Za-z_][A-Za-z0-9_]*\s*=/i,
    message: 'Top-level const declarations are forbidden; use NAME .equ expr.',
  },
  {
    id: 'single-line-type-alias',
    pattern: /^\s*\.type\s+[A-Za-z_][A-Za-z0-9_]*\s+\S/i,
    message: 'Single-line type aliases are forbidden; use .type/.endtype field blocks.',
  },
  {
    id: 'operand-address-of',
    pattern: /(?:^|[,\s(])@[A-Za-z_][A-Za-z0-9_]*(?!\s*:)(?:\b|\[)/,
    message: 'Operand-level @address syntax is forbidden; use labels, .equ constants, or layout casts.',
  },
];

const SOURCE_COMMENT_RULES = [
  {
    id: 'removed-register-contracts-at-comment',
    pattern: /^\s*;\s*!\s*@/,
    message: 'Removed register-contracts @ comments are forbidden; use compact `;!      in/out/clobbers` lines.',
  },
  {
    id: 'removed-register-contracts-divider-block',
    pattern: /^\s*;\s*=+\s+AZM\s*$/i,
    message: 'Removed AZM divider contract blocks are forbidden; use compact `;!      in/out/clobbers` lines.',
  },
];

const ASMI_RULES = [
  {
    id: 'asmi-comment-line',
    pattern: /^\s*;/,
    message: '.asmi interface files are comment-free; remove comment lines.',
  },
];

const DEFAULT_SCAN_ROOTS = ['.'];
const FORBIDDEN_SOURCE_EXTENSION_NAMES = ['azm', 'azmi', 'zac', 'zax'];
const FORBIDDEN_SOURCE_EXTENSIONS = FORBIDDEN_SOURCE_EXTENSION_NAMES.map((ext) => `.${ext}`);
const IGNORED_PATH_PATTERNS = [
  { exact: '.git', prefix: '.git/', contains: '/.git/' },
  { exact: 'dist', prefix: 'dist/', contains: '/dist/' },
  { exact: 'node_modules', prefix: 'node_modules/', contains: '/node_modules/' },
  { exact: 'lib/node_modules', prefix: 'lib/node_modules/', contains: '/lib/node_modules/' },
];

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function stripLineComment(line) {
  const trimmed = line.trimStart();
  if (isWholeLineComment(trimmed)) return '';
  const commentIdx = firstLineCommentIndex(line);
  return commentIdx === -1 ? line : line.slice(0, commentIdx);
}

function isWholeLineComment(trimmed) {
  return trimmed.startsWith(';') || trimmed.startsWith('//');
}

function firstLineCommentIndex(line) {
  return minFoundIndex([line.indexOf(';'), line.indexOf('//')]);
}

function minFoundIndex(indexes) {
  const found = indexes.filter((index) => index !== -1);
  return found.length === 0 ? -1 : Math.min(...found);
}

function collectFilesFromRoots(repoRoot, roots, acceptsFile) {
  const files = [];
  const queue = roots.map((root) => resolve(repoRoot, root));

  while (queue.length > 0) {
    visitQueuedPath(queue, files, acceptsFile);
  }

  files.sort();
  return files;
}

function visitQueuedPath(queue, files, acceptsFile) {
  const current = queue.pop();
  if (!current || isIgnoredPath(current)) return;
  const stat = safeStat(current);
  if (!stat) return;
  visitStatPath(queue, files, acceptsFile, current, stat);
}

function visitStatPath(queue, files, acceptsFile, current, stat) {
  if (stat.isDirectory()) return enqueueDirectoryEntries(queue, current);
  if (stat.isFile() && acceptsFile(current)) return files.push(current);
  return undefined;
}

function safeStat(path) {
  try {
    return statSync(path);
  } catch {
    return undefined;
  }
}

function enqueueDirectoryEntries(queue, dirPath) {
  for (const entry of readdirSync(dirPath)) queue.push(resolve(dirPath, entry));
}

function isScannedSourceFile(path) {
  const lower = path.toLowerCase();
  return lower.endsWith('.asm') || lower.endsWith('.z80') || lower.endsWith('.asmi') || lower.endsWith('.md');
}

function isIgnoredPath(path) {
  const normalized = normalizePath(path);
  return normalized.endsWith('/package-lock.json') || IGNORED_PATH_PATTERNS.some((pattern) => matchesIgnoredPath(normalized, pattern));
}

function matchesIgnoredPath(path, pattern) {
  return path === pattern.exact || path.startsWith(pattern.prefix) || path.includes(pattern.contains);
}

function collectForbiddenExtensionFiles(repoRoot, roots) {
  return collectFilesFromRoots(repoRoot, roots, (current) => {
    const lower = current.toLowerCase();
    return FORBIDDEN_SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  });
}

function isAssemblyFence(line) {
  const lang = line.trimStart().slice(3).trim().toLowerCase();
  if (lang.length === 0) return true;
  return /^(azm|z80|asm|asm80)\b/.test(lang);
}

function* iterMarkdownFenceLines(text) {
  const lines = text.split(/\r?\n/);
  let state = { inFence: false, scanFence: false };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trimStart();
    if (isMarkdownFenceDelimiter(trimmed)) {
      state = nextMarkdownFenceState(trimmed, state.inFence);
      continue;
    }
    yield* markdownFenceLine(i, line, state);
  }
}

function isMarkdownFenceDelimiter(trimmed) {
  return trimmed.startsWith('```');
}

function shouldYieldFenceLine(inFence, scanFence) {
  return inFence && scanFence;
}

function* markdownFenceLine(index, line, state) {
  if (shouldYieldFenceLine(state.inFence, state.scanFence)) {
    yield { line: index + 1, text: line };
  }
}

function nextMarkdownFenceState(trimmed, inFence) {
  return inFence
    ? { inFence: false, scanFence: false }
    : { inFence: true, scanFence: isAssemblyFence(trimmed) };
}

/**
 * @param {{
 *   repoRoot?: string;
 *   roots?: string[];
 *   filePaths?: string[];
 * }} [options]
 */
export function scanForbiddenRemovedSyntax(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const roots = options.filePaths ? options.filePaths : (options.roots ?? DEFAULT_SCAN_ROOTS);
  const files = sourceFilesForScan(repoRoot, options);
  const violations = [
    ...removedExtensionViolations(repoRoot, roots),
    ...files.flatMap((file) => fileSyntaxViolations(repoRoot, file)),
  ];
  return { violations };
}

function sourceFilesForScan(repoRoot, options) {
  return options.filePaths
    ? options.filePaths.map((p) => resolve(repoRoot, p)).sort()
    : collectFilesFromRoots(repoRoot, options.roots ?? DEFAULT_SCAN_ROOTS, isScannedSourceFile);
}

function removedExtensionViolations(repoRoot, roots) {
  return collectForbiddenExtensionFiles(repoRoot, roots).map((file) => ({
    file: reportedPath(repoRoot, file),
    line: 1,
    column: 1,
    ruleId: 'removed-source-extension',
    message: 'Removed source extensions are forbidden; use .asm or .z80.',
  }));
}

function fileSyntaxViolations(repoRoot, file) {
  const reportedFile = reportedPath(repoRoot, file);
  const text = readFileSync(file, 'utf8');
  return scannedLines(file, text).flatMap((lineEntry) => lineViolations(reportedFile, file, lineEntry));
}

function reportedPath(repoRoot, file) {
  const rel = normalizePath(relative(repoRoot, file));
  return rel.startsWith('..') ? normalizePath(file) : rel;
}

function scannedLines(file, text) {
  return file.toLowerCase().endsWith('.md')
    ? Array.from(iterMarkdownFenceLines(text))
    : text.split(/\r?\n/).map((line, idx) => ({ line: idx + 1, text: line ?? '' }));
}

function lineViolations(reportedFile, file, lineEntry) {
  return [
    ...lineRuleViolations(reportedFile, lineEntry, rawLineRules(file)),
    ...lineRuleViolations(reportedFile, { ...lineEntry, text: stripLineComment(lineEntry.text) }, FORBIDDEN_RULES),
  ];
}

function rawLineRules(file) {
  return file.toLowerCase().endsWith('.asmi') ? ASMI_RULES : SOURCE_COMMENT_RULES;
}

function lineRuleViolations(reportedFile, lineEntry, rules) {
  return rules.flatMap((rule) => violationForRule(reportedFile, lineEntry, rule));
}

function violationForRule(reportedFile, lineEntry, rule) {
  const match = lineEntry.text.match(rule.pattern);
  return match
    ? [{
        file: reportedFile,
        line: lineEntry.line,
        column: (match.index ?? 0) + 1,
        ruleId: rule.id,
        message: rule.message,
      }]
    : [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { violations } = scanForbiddenRemovedSyntax();
  if (violations.length === 0) {
    process.stdout.write('removed syntax guardrail: no violations\n');
    process.exit(0);
  }
  for (const v of violations) {
    process.stderr.write(`${v.file}:${v.line}:${v.column} [${v.ruleId}] ${v.message}\n`);
  }
  process.stderr.write(`removed syntax guardrail: ${violations.length} violation(s)\n`);
  process.exit(1);
}
