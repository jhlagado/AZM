import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

export const FORBIDDEN_RULES = [
  {
    id: 'bare-data-marker',
    pattern: /^\s*data\s*$/i,
    message: 'Bare `data` marker lines are forbidden; use labels plus .db/.dw/.ds.',
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
    id: 'top-level-const-decl',
    pattern: /^\s*(?:export\s+)?const\s+[A-Za-z_][A-Za-z0-9_]*\s*=/i,
    message: 'Top-level const declarations are forbidden; use NAME .equ expr.',
  },
];

export const DEFAULT_SCAN_ROOTS = ['README.md', 'docs', 'examples', 'test/fixtures'];
export const FORBIDDEN_SOURCE_EXTENSIONS = ['.azm', '.azmi', '.zac', '.zax'];

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function stripLineComment(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith(';') || trimmed.startsWith('//')) return '';
  const semicolonIdx = line.indexOf(';');
  const slashIdx = line.indexOf('//');
  if (semicolonIdx === -1 && slashIdx === -1) return line;
  if (semicolonIdx === -1) return line.slice(0, slashIdx);
  if (slashIdx === -1) return line.slice(0, semicolonIdx);
  return line.slice(0, Math.min(semicolonIdx, slashIdx));
}

function collectFilesFromRoots(repoRoot, roots) {
  const files = [];
  const queue = roots.map((root) => resolve(repoRoot, root));

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    let stat;
    try {
      stat = statSync(current);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) queue.push(resolve(current, entry));
      continue;
    }
    if (
      stat.isFile() &&
      (current.toLowerCase().endsWith('.asm') ||
        current.toLowerCase().endsWith('.z80') ||
        current.toLowerCase().endsWith('.md'))
    ) {
      files.push(current);
    }
  }

  files.sort();
  return files;
}

function isIgnoredPath(path) {
  const normalized = normalizePath(path);
  return (
    normalized.includes('/.git/') ||
    normalized.includes('/dist/') ||
    normalized.includes('/node_modules/') ||
    normalized.includes('/lib/node_modules/') ||
    normalized.endsWith('/package-lock.json')
  );
}

function collectForbiddenExtensionFiles(repoRoot, roots) {
  const files = [];
  const queue = roots.map((root) => resolve(repoRoot, root));

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || isIgnoredPath(current)) continue;
    let stat;
    try {
      stat = statSync(current);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) queue.push(resolve(current, entry));
      continue;
    }
    if (!stat.isFile()) continue;
    const lower = current.toLowerCase();
    if (FORBIDDEN_SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext))) files.push(current);
  }

  files.sort();
  return files;
}

function isAssemblyFence(line) {
  const lang = line.trimStart().slice(3).trim().toLowerCase();
  if (lang.length === 0) return true;
  return /^(azm|z80|asm|asm80)\b/.test(lang);
}

function* iterMarkdownFenceLines(text) {
  const lines = text.split(/\r?\n/);
  let inFence = false;
  let scanFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```')) {
      if (!inFence) {
        inFence = true;
        scanFence = isAssemblyFence(trimmed);
      } else {
        inFence = false;
        scanFence = false;
      }
      continue;
    }
    if (inFence && scanFence) yield { line: i + 1, text: line };
  }
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
  const files = options.filePaths
    ? options.filePaths.map((p) => resolve(repoRoot, p)).sort()
    : collectFilesFromRoots(repoRoot, options.roots ?? DEFAULT_SCAN_ROOTS);

  /** @type {Array<{file: string; line: number; column: number; ruleId: string; message: string}>} */
  const violations = [];

  for (const file of collectForbiddenExtensionFiles(
    repoRoot,
    options.filePaths ? options.filePaths : (options.roots ?? DEFAULT_SCAN_ROOTS),
  )) {
    const rel = normalizePath(relative(repoRoot, file));
    const reportedFile = rel.startsWith('..') ? normalizePath(file) : rel;
    violations.push({
      file: reportedFile,
      line: 1,
      column: 1,
      ruleId: 'removed-source-extension',
      message: 'Removed source extensions are forbidden; use .asm or .z80.',
    });
  }

  for (const file of files) {
    const rel = normalizePath(relative(repoRoot, file));
    const reportedFile = rel.startsWith('..') ? normalizePath(file) : rel;
    const text = readFileSync(file, 'utf8');
    const isMarkdown = file.toLowerCase().endsWith('.md');
    const lines = isMarkdown
      ? Array.from(iterMarkdownFenceLines(text))
      : text.split(/\r?\n/).map((line, idx) => ({ line: idx + 1, text: line ?? '' }));

    for (const lineEntry of lines) {
      const scanned = stripLineComment(lineEntry.text);
      for (const rule of FORBIDDEN_RULES) {
        const match = scanned.match(rule.pattern);
        if (!match) continue;
        violations.push({
          file: reportedFile,
          line: lineEntry.line,
          column: (match.index ?? 0) + 1,
          ruleId: rule.id,
          message: rule.message,
        });
      }
    }
  }

  return { violations };
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
