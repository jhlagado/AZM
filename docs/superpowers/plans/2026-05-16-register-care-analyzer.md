# Register Care Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first AZM register-care implementation: audit/report output, smart-comment contracts and hints, direct-call register lifetime diagnostics, and a path to generated contracts.

**Architecture:** Add a focused `src/registerCare/` analysis subsystem that runs after parsing/semantic analysis and before lowering. The analyzer consumes the existing frontend AST plus `sourceLineComments`, uses a Z80 effect table to infer routine summaries and caller conflicts, and returns diagnostics plus text artifacts. CLI and API options expose the feature without changing ASM80-compatible default behavior.

**Tech Stack:** TypeScript, existing AZM parser/compile pipeline, Vitest, existing artifact writers and CLI harness.

---

## Scope

This plan builds the first useful version, not the full theorem prover. It must produce tangible compiler output:

- `--register-care audit`
- `--emit-register-report`
- a `.regcare.txt` artifact from the CLI
- parsed `;! @tag {carrier}` smart comments
- inferred routine summaries for direct ASM80-style calls
- warning/error modes for high-confidence direct-call conflicts

Behavior-changing autofixes such as inserting `push`/`pop` are not included in this plan. Contract generation is included as a report/interface artifact, not in-place source rewriting.

## File Structure

Create these new files:

- `src/registerCare/types.ts`  
  Shared types for modes, carriers, effects, summaries, contracts, hints, reports, and analysis results.

- `src/registerCare/carriers.ts`  
  Normalizes human carrier notation such as `DE`, `AF`, `carry`, and `IX` into byte/flag units.

- `src/registerCare/smartComments.ts`  
  Parses `;! @proc`, `@in`, `@out`, `@clobbers`, `@preserves`, `@expect-out`, and `@end` from existing line comments.

- `src/registerCare/programModel.ts`  
  Extracts source-ordered ASM instructions, labels, direct call targets, and routine ranges from `ProgramNode`.

- `src/z80/effects.ts`  
  Z80 instruction effect summaries. Keep this in `z80/` because it is ISA knowledge, not analyzer orchestration.

- `src/registerCare/summary.ts`  
  Infers routine summaries from instruction streams and smart-comment contracts.

- `src/registerCare/liveness.ts`  
  Runs local backwards liveness across routine bodies and detects direct-call conflicts.

- `src/registerCare/report.ts`  
  Renders deterministic text reports and generated smart-comment contract blocks.

- `src/registerCare/analyze.ts`  
  Orchestrates parsing smart comments, building the program model, summary inference, liveness checks, diagnostics, and artifacts.

- `test/registerCare/carriers.test.ts`
- `test/registerCare/smartComments.test.ts`
- `test/registerCare/programModel.test.ts`
- `test/registerCare/effects.test.ts`
- `test/registerCare/summary.test.ts`
- `test/registerCare/report.test.ts`
- `test/registerCare/integration.test.ts`
- `test/cli/register_care_cli.test.ts`

Modify these existing files:

- `src/pipeline.ts`  
  Add compiler options for register-care mode and artifacts.

- `src/compile.ts`  
  Invoke the analyzer and append report artifacts.

- `src/cli.ts`  
  Parse CLI flags and write `.regcare.txt` / `.azmi` artifacts.

- `src/formats/types.ts`  
  Add artifact types for register-care report and generated interface text.

- `src/diagnosticTypes.ts`  
  Add stable diagnostic IDs for register-care warnings/errors.

- `src/api-compile.ts` and `src/index.ts`  
  Export new option/artifact types if needed by public API consumers.

## Task 1: Wire Options And Report Artifact

**Files:**
- Create: `src/registerCare/types.ts`
- Modify: `src/pipeline.ts`
- Modify: `src/formats/types.ts`
- Modify: `src/compile.ts`
- Modify: `src/cli.ts`
- Modify: `src/api-compile.ts`
- Modify: `src/index.ts`
- Create: `test/registerCare/integration.test.ts`
- Create: `test/cli/register_care_cli.test.ts`

- [ ] **Step 1: Write the failing compile API test**

Create `test/registerCare/integration.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { RegisterCareReportArtifact } from '../../src/formats/types.js';

describe('register-care integration', () => {
  it('emits a register-care report artifact in audit mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(entry, ['START:', '    nop', '    ret', '.end'].join('\n'), 'utf8');

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'audit',
        emitRegisterReport: true,
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const report = res.artifacts.find(
      (a): a is RegisterCareReportArtifact => a.kind === 'register-care-report',
    );
    expect(report?.text).toContain('AZM Register-Care Report');
    expect(report?.text).toContain('Mode: audit');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/registerCare/integration.test.ts
```

Expected: TypeScript or test failure because the new options and artifact type do not exist.

- [ ] **Step 3: Add option and artifact types**

Create `src/registerCare/types.ts` with the public mode type:

```ts
export type RegisterCareMode = 'off' | 'audit' | 'warn' | 'error' | 'strict';
```

In `src/pipeline.ts`, import the mode type:

```ts
import type { RegisterCareMode } from './registerCare/types.js';
```

Then add these fields inside the existing `CompilerOptions` interface:

```ts

export interface CompilerOptions {
  // existing fields remain
  /** Register-care analysis mode. Defaults to off for ASM80 compatibility. */
  registerCare?: RegisterCareMode;
  /** Emit a human-readable register-care report artifact. */
  emitRegisterReport?: boolean;
  /** Emit inferred smart-comment contracts as an interface artifact. */
  emitRegisterInterface?: boolean;
  /** Optional platform/profile name for external contracts such as MON-3. */
  registerCareProfile?: 'mon3';
}
```

Keep the existing fields in `CompilerOptions`; add these fields inside the existing interface rather than replacing it. Do not define `RegisterCareMode` in `pipeline.ts`; it belongs to `src/registerCare/types.ts`.

In `src/formats/types.ts`, add:

```ts
export interface RegisterCareReportArtifact {
  kind: 'register-care-report';
  path?: string;
  text: string;
}

export interface RegisterCareInterfaceArtifact {
  kind: 'register-care-interface';
  path?: string;
  text: string;
}
```

Then extend `Artifact`:

```ts
export type Artifact =
  | HexArtifact
  | BinArtifact
  | ListingArtifact
  | D8mArtifact
  | Asm80Artifact
  | RegisterCareReportArtifact
  | RegisterCareInterfaceArtifact;
```

- [ ] **Step 4: Add a minimal analyzer stub**

Create `src/registerCare/analyze.ts`:

```ts
import type { Diagnostic } from '../diagnosticTypes.js';
import type { LoadedProgram } from '../moduleLoader.js';
import type { RegisterCareMode } from './types.js';

export interface AnalyzeRegisterCareOptions {
  mode: RegisterCareMode;
  emitReport: boolean;
  emitInterface: boolean;
  profile?: 'mon3';
}

export interface AnalyzeRegisterCareResult {
  diagnostics: Diagnostic[];
  reportText?: string;
  interfaceText?: string;
}

export function analyzeRegisterCare(
  loaded: LoadedProgram,
  options: AnalyzeRegisterCareOptions,
): AnalyzeRegisterCareResult {
  const mode = options.mode;
  const reportText = options.emitReport
    ? [
        'AZM Register-Care Report',
        `Entry: ${loaded.program.entryFile}`,
        `Mode: ${mode}`,
        '',
        'No routine summaries were inferred in this implementation slice.',
        '',
      ].join('\n')
    : undefined;
  return { diagnostics: [], ...(reportText ? { reportText } : {}) };
}
```

- [ ] **Step 5: Invoke the analyzer from `compile()`**

In `src/compile.ts`, import `analyzeRegisterCare` and add after semantic analysis succeeds and before `emitProgram(...)`:

```ts
  const registerCareMode = options.registerCare ?? 'off';
  if (registerCareMode !== 'off' || options.emitRegisterReport || options.emitRegisterInterface) {
    const registerCare = analyzeRegisterCare(loaded, {
      mode: registerCareMode,
      emitReport: options.emitRegisterReport === true,
      emitInterface: options.emitRegisterInterface === true,
      ...(options.registerCareProfile ? { profile: options.registerCareProfile } : {}),
    });
    diagnostics.push(...registerCare.diagnostics);
    if (registerCare.reportText) {
      artifacts.push({ kind: 'register-care-report', text: registerCare.reportText });
    }
    if (registerCare.interfaceText) {
      artifacts.push({ kind: 'register-care-interface', text: registerCare.interfaceText });
    }
    if (hasErrors(diagnostics)) {
      return { diagnostics, artifacts };
    }
  }
```

This requires moving `const artifacts: Artifact[] = [];` before the analyzer block. Preserve existing BIN/HEX/D8M/listing behavior.

- [ ] **Step 6: Add CLI flags and artifact writing**

In `src/cli.ts`, extend `CliOptions` / `CliState` with:

```ts
registerCare: RegisterCareMode;
emitRegisterReport: boolean;
emitRegisterInterface: boolean;
registerCareProfile: 'mon3' | undefined;
```

Import the mode type in `src/cli.ts` from the analyzer type module:

```ts
import type { RegisterCareMode } from './registerCare/types.js';
```

Add usage lines:

```text
      --register-care <m> Register-care mode: off|audit|warn|error|strict
      --emit-register-report Emit .regcare.txt report
      --emit-register-interface Emit inferred .azmi interface
      --register-profile <p> Register-care profile: mon3
```

Parse `--register-care`, `--emit-register-report`, `--emit-register-interface`, and `--register-profile`.

In `writeArtifacts`, add:

```ts
  const regCarePath = `${base}.regcare.txt`;
  const regInterfacePath = `${base}.azmi`;
```

and write artifacts:

```ts
  const registerReport = byKind.get('register-care-report');
  if (registerReport && registerReport.kind === 'register-care-report') {
    await ensureDir(regCarePath);
    writes.push(writeFile(regCarePath, registerReport.text, 'utf8'));
  }
  const registerInterface = byKind.get('register-care-interface');
  if (registerInterface && registerInterface.kind === 'register-care-interface') {
    await ensureDir(regInterfacePath);
    writes.push(writeFile(regInterfacePath, registerInterface.text, 'utf8'));
  }
```

In `src/api-compile.ts` and `src/index.ts`, export the public type:

```ts
export type { RegisterCareMode } from './registerCare/types.js';
```

- [ ] **Step 7: Write the CLI test**

Create `test/cli/register_care_cli.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCli } from '../../src/cli.js';

describe('CLI register-care flags', () => {
  it('writes a .regcare.txt artifact when requested', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-cli-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(entry, ['START:', '    nop', '    ret', '.end'].join('\n'), 'utf8');

    const code = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--register-care',
      'audit',
      '--emit-register-report',
      entry,
    ]);

    expect(code).toBe(0);
    const reportPath = join(dir, 'main.regcare.txt');
    expect(existsSync(reportPath)).toBe(true);
    expect(readFileSync(reportPath, 'utf8')).toContain('AZM Register-Care Report');
  });
});
```

- [ ] **Step 8: Run tests**

Run:

```bash
npm test -- test/registerCare/integration.test.ts test/cli/register_care_cli.test.ts
```

Expected: both tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/pipeline.ts src/formats/types.ts src/compile.ts src/cli.ts src/api-compile.ts src/index.ts src/registerCare/types.ts src/registerCare/analyze.ts test/registerCare/integration.test.ts test/cli/register_care_cli.test.ts
git commit -m "feat: add register-care audit report plumbing"
```

## Task 2: Carrier Normalization

**Files:**
- Create: `src/registerCare/types.ts`
- Create: `src/registerCare/carriers.ts`
- Create: `test/registerCare/carriers.test.ts`

- [ ] **Step 1: Write carrier tests**

Create `test/registerCare/carriers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { expandCarrierList, normalizeCarrierName } from '../../src/registerCare/carriers.js';

describe('register-care carriers', () => {
  it('normalizes register pairs into byte carriers', () => {
    expect(expandCarrierList(['DE', 'HL'])).toEqual(['D', 'E', 'H', 'L']);
  });

  it('normalizes AF into A plus flags register carrier', () => {
    expect(expandCarrierList(['AF'])).toEqual(['A', 'F']);
  });

  it('normalizes named flags without changing their meaning', () => {
    expect(expandCarrierList(['carry', 'zero'])).toEqual(['carry', 'zero']);
  });

  it('keeps bare C as the Z80 C register', () => {
    expect(normalizeCarrierName('C')).toBe('C');
    expect(normalizeCarrierName('carry')).toBe('carry');
    expect(normalizeCarrierName('CARRY')).toBe('carry');
  });

  it('normalizes index registers into high and low byte carriers', () => {
    expect(expandCarrierList(['IX', 'IY'])).toEqual(['IXH', 'IXL', 'IYH', 'IYL']);
  });

  it('rejects unknown carrier names', () => {
    expect(normalizeCarrierName('BAD')).toBeUndefined();
    expect(expandCarrierList(['DE', 'BAD'])).toBeUndefined();
    expect(expandCarrierList(['BAD'])).toBeUndefined();
  });

  it('dedupes expanded carriers while preserving first occurrence order', () => {
    expect(expandCarrierList(['DE', 'D', 'HL', 'E'])).toEqual(['D', 'E', 'H', 'L']);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/registerCare/carriers.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement carrier types**

Create `src/registerCare/types.ts`:

```ts
export type RegisterCareUnit =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'H'
  | 'L'
  | 'F'
  | 'IXH'
  | 'IXL'
  | 'IYH'
  | 'IYL'
  | 'SPH'
  | 'SPL'
  | 'carry'
  | 'zero'
  | 'sign'
  | 'parity'
  | 'halfCarry'
  | 'negative';

export interface CarrierSet {
  units: RegisterCareUnit[];
}
```

- [ ] **Step 4: Implement normalization**

Create `src/registerCare/carriers.ts`:

```ts
import type { RegisterCareUnit } from './types.js';

const SINGLE_UNITS = new Set<RegisterCareUnit>([
  'A',
  'B',
  'C',
  'D',
  'E',
  'H',
  'L',
  'F',
  'IXH',
  'IXL',
  'IYH',
  'IYL',
  'SPH',
  'SPL',
  'carry',
  'zero',
  'sign',
  'parity',
  'halfCarry',
  'negative',
]);

const PAIRS: Readonly<Record<string, RegisterCareUnit[]>> = {
  AF: ['A', 'F'],
  BC: ['B', 'C'],
  DE: ['D', 'E'],
  HL: ['H', 'L'],
  IX: ['IXH', 'IXL'],
  IY: ['IYH', 'IYL'],
  SP: ['SPH', 'SPL'],
};

const FLAG_ALIASES: Readonly<Record<string, RegisterCareUnit>> = {
  CARRY: 'carry',
  ZERO: 'zero',
  Z: 'zero',
  SIGN: 'sign',
  S: 'sign',
  PARITY: 'parity',
  PV: 'parity',
  'P/V': 'parity',
  HALFCARRY: 'halfCarry',
  HFLAG: 'halfCarry',
  NEGATIVE: 'negative',
  N: 'negative',
};

export function normalizeCarrierName(raw: string): RegisterCareUnit | undefined {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  const flag = FLAG_ALIASES[upper];
  if (flag) return flag;
  if (SINGLE_UNITS.has(upper as RegisterCareUnit)) return upper as RegisterCareUnit;
  return undefined;
}

export function expandCarrier(raw: string): RegisterCareUnit[] | undefined {
  const upper = raw.trim().toUpperCase();
  const pair = PAIRS[upper];
  if (pair) return pair;
  const single = normalizeCarrierName(raw);
  return single ? [single] : undefined;
}

export function expandCarrierList(raw: string[]): RegisterCareUnit[] | undefined {
  const out: RegisterCareUnit[] = [];
  const seen = new Set<RegisterCareUnit>();
  for (const item of raw) {
    const expanded = expandCarrier(item);
    if (!expanded) return undefined;
    for (const unit of expanded) {
      if (seen.has(unit)) continue;
      seen.add(unit);
      out.push(unit);
    }
  }
  return out;
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- test/registerCare/carriers.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/registerCare/types.ts src/registerCare/carriers.ts test/registerCare/carriers.test.ts
git commit -m "feat: add register-care carrier normalization"
```

## Task 3: Smart Comment Parser

**Files:**
- Modify: `src/registerCare/types.ts`
- Create: `src/registerCare/smartComments.ts`
- Create: `test/registerCare/smartComments.test.ts`

- [ ] **Step 1: Write parser tests**

Create `test/registerCare/smartComments.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { parseSmartCommentLine } from '../../src/registerCare/smartComments.js';

describe('register-care smart comments', () => {
  it('parses proc tags', () => {
    expect(parseSmartCommentLine(';! @proc CHECK_COLLISION_AT_DE')).toEqual({
      kind: 'proc',
      name: 'CHECK_COLLISION_AT_DE',
    });
  });

  it('parses carrier tags with documentation names', () => {
    expect(parseSmartCommentLine(';! @in {DE} raw_coord')).toEqual({
      kind: 'in',
      carriers: ['D', 'E'],
      name: 'raw_coord',
    });
  });

  it('parses carrier-list tags', () => {
    expect(parseSmartCommentLine(';! @clobbers {A,F,carry}')).toEqual({
      kind: 'clobbers',
      carriers: ['A', 'F', 'carry'],
    });
  });

  it('parses caller expect-out hints', () => {
    expect(parseSmartCommentLine(';! @expect-out {HL} pointer')).toEqual({
      kind: 'expectOut',
      carriers: ['H', 'L'],
      name: 'pointer',
    });
  });

  it('ignores ordinary comments', () => {
    expect(parseSmartCommentLine('; clobbers A')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/registerCare/smartComments.test.ts
```

Expected: FAIL because `smartComments.ts` does not exist.

- [ ] **Step 3: Add smart-comment types**

Extend `src/registerCare/types.ts`:

```ts
export type SmartComment =
  | { kind: 'proc'; name: string }
  | { kind: 'extern'; name: string }
  | { kind: 'end' }
  | { kind: 'in'; carriers: RegisterCareUnit[]; name?: string }
  | { kind: 'out'; carriers: RegisterCareUnit[]; name?: string }
  | { kind: 'clobbers'; carriers: RegisterCareUnit[] }
  | { kind: 'preserves'; carriers: RegisterCareUnit[] }
  | { kind: 'expectOut'; carriers: RegisterCareUnit[]; name?: string };

export interface LocatedSmartComment {
  file: string;
  line: number;
  comment: SmartComment;
}
```

- [ ] **Step 4: Implement parser**

Create `src/registerCare/smartComments.ts`:

```ts
import { expandCarrierList } from './carriers.js';
import type { LocatedSmartComment, SmartComment } from './types.js';

const TAG_RE = /^;?\s*!\s*@([A-Za-z-]+)(?:\s+(.*))?$/;
const CARRIER_RE = /^\{([^}]+)\}(?:\s+(.+))?$/;

function parseCarrierPayload(rest: string | undefined): { carriers: string[]; name?: string } | undefined {
  if (!rest) return undefined;
  const match = CARRIER_RE.exec(rest.trim());
  if (!match) return undefined;
  const carriers = match[1]!
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const name = match[2]?.trim();
  return { carriers, ...(name ? { name } : {}) };
}

export function parseSmartCommentLine(line: string): SmartComment | undefined {
  const match = TAG_RE.exec(line.trim());
  if (!match) return undefined;
  const tag = match[1]!.toLowerCase();
  const rest = match[2]?.trim();

  if (tag === 'proc') {
    return rest ? { kind: 'proc', name: rest } : undefined;
  }
  if (tag === 'extern') {
    return rest ? { kind: 'extern', name: rest } : undefined;
  }
  if (tag === 'end') {
    return { kind: 'end' };
  }

  const payload = parseCarrierPayload(rest);
  if (!payload) return undefined;
  const carriers = expandCarrierList(payload.carriers);
  if (!carriers || carriers.length === 0) return undefined;

  if (tag === 'in') return { kind: 'in', carriers, ...(payload.name ? { name: payload.name } : {}) };
  if (tag === 'out') return { kind: 'out', carriers, ...(payload.name ? { name: payload.name } : {}) };
  if (tag === 'clobbers') return { kind: 'clobbers', carriers };
  if (tag === 'preserves') return { kind: 'preserves', carriers };
  if (tag === 'expect-out') {
    return { kind: 'expectOut', carriers, ...(payload.name ? { name: payload.name } : {}) };
  }

  return undefined;
}

export function parseSmartComments(
  sourceLineComments: Map<string, Map<number, string>>,
): LocatedSmartComment[] {
  const out: LocatedSmartComment[] = [];
  for (const [file, comments] of sourceLineComments) {
    for (const [line, text] of comments) {
      const parsed = parseSmartCommentLine(`;${text}`);
      if (parsed) out.push({ file, line, comment: parsed });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- test/registerCare/smartComments.test.ts test/registerCare/carriers.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/registerCare/types.ts src/registerCare/smartComments.ts test/registerCare/smartComments.test.ts
git commit -m "feat: parse register-care smart comments"
```

## Task 4: Program Model For ASM80 Streams

**Files:**
- Modify: `src/registerCare/types.ts`
- Create: `src/registerCare/programModel.ts`
- Create: `test/registerCare/programModel.test.ts`

- [ ] **Step 1: Write program model tests**

Create `test/registerCare/programModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { ModuleFileNode, ProgramNode } from '../../src/frontend/ast.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { parseClassicModuleFile } from '../../src/frontend/asm80/parseClassicModule.js';
import { buildRegisterCareProgramModel } from '../../src/registerCare/programModel.js';

function parseProgram(path: string, text: string): ProgramNode {
  const diagnostics = [];
  const sf = makeSourceFile(path, text);
  const file = parseClassicModuleFile(path, text, diagnostics, sf) as ModuleFileNode;
  if (diagnostics.length > 0) throw new Error(JSON.stringify(diagnostics));
  return { kind: 'Program', entryFile: path, files: [file], span: span(sf, 0, text.length) };
}

describe('register-care program model', () => {
  it('collects labels, instructions, and direct call targets', () => {
    const program = parseProgram(
      '/tmp/main.z80',
      ['START:', '    call HELPER', '    ret', 'HELPER:', '    ld a,1', '    ret', '.end'].join('\n'),
    );

    const model = buildRegisterCareProgramModel(program);

    expect(model.directCallTargets).toEqual(['HELPER']);
    expect(model.routines.map((r) => r.name)).toEqual(['HELPER']);
    expect(model.routines[0]?.instructions.map((i) => i.head)).toEqual(['ld', 'ret']);
  });

  it('keeps internal labels inside a routine body', () => {
    const program = parseProgram(
      '/tmp/main.z80',
      [
        'START:',
        '    call LOOP_ROUTINE',
        '    ret',
        'LOOP_ROUTINE:',
        '.loop:',
        '    djnz .loop',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterCareProgramModel(program);

    expect(model.routines[0]?.labels).toContain('.loop');
    expect(model.routines[0]?.instructions.map((i) => i.head)).toEqual(['djnz', 'ret']);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/registerCare/programModel.test.ts
```

Expected: FAIL because `programModel.ts` does not exist.

- [ ] **Step 3: Add model types**

Extend `src/registerCare/types.ts`:

```ts
import type { AsmInstructionNode, SourceSpan } from '../frontend/ast.js';

export interface RegisterCareInstruction {
  instruction: AsmInstructionNode;
  head: string;
  file: string;
  line: number;
  column: number;
}

export interface RegisterCareRoutine {
  name: string;
  span: SourceSpan;
  labels: string[];
  instructions: RegisterCareInstruction[];
}

export interface RegisterCareProgramModel {
  routines: RegisterCareRoutine[];
  directCallTargets: string[];
}
```

- [ ] **Step 4: Implement model extraction**

Create `src/registerCare/programModel.ts`:

```ts
import type {
  AsmInstructionNode,
  AsmLabelNode,
  ModuleItemNode,
  ProgramNode,
  SectionItemNode,
} from '../frontend/ast.js';
import type {
  RegisterCareInstruction,
  RegisterCareProgramModel,
  RegisterCareRoutine,
} from './types.js';

type FlatItem =
  | { kind: 'label'; label: AsmLabelNode }
  | { kind: 'instruction'; instruction: AsmInstructionNode };

function flattenItems(items: Array<ModuleItemNode | SectionItemNode>, out: FlatItem[]): void {
  for (const item of items) {
    if (item.kind === 'NamedSection') {
      flattenItems(item.items, out);
      continue;
    }
    if (item.kind === 'AsmLabel') {
      out.push({ kind: 'label', label: item });
      continue;
    }
    if (item.kind === 'AsmInstruction') {
      out.push({ kind: 'instruction', instruction: item });
    }
  }
}

function directCallTarget(inst: AsmInstructionNode): string | undefined {
  if (inst.head.toLowerCase() !== 'call' || inst.operands.length !== 1) return undefined;
  const op = inst.operands[0];
  if (op?.kind !== 'Imm' || op.expr.kind !== 'ImmName') return undefined;
  return op.expr.name;
}

function toInstruction(inst: AsmInstructionNode): RegisterCareInstruction {
  return {
    instruction: inst,
    head: inst.head.toLowerCase(),
    file: inst.span.file,
    line: inst.span.start.line,
    column: inst.span.start.column,
  };
}

export function buildRegisterCareProgramModel(program: ProgramNode): RegisterCareProgramModel {
  const flat: FlatItem[] = [];
  for (const file of program.files) flattenItems(file.items, flat);

  const targetSet = new Set<string>();
  for (const item of flat) {
    if (item.kind !== 'instruction') continue;
    const target = directCallTarget(item.instruction);
    if (target) targetSet.add(target);
  }

  const routines: RegisterCareRoutine[] = [];
  for (let i = 0; i < flat.length; i++) {
    const item = flat[i]!;
    if (item.kind !== 'label' || !targetSet.has(item.label.name)) continue;

    const labels = [item.label.name];
    const instructions: RegisterCareInstruction[] = [];
    for (let j = i + 1; j < flat.length; j++) {
      const next = flat[j]!;
      if (next.kind === 'label') {
        if (targetSet.has(next.label.name)) break;
        labels.push(next.label.name);
        continue;
      }
      instructions.push(toInstruction(next.instruction));
      const head = next.instruction.head.toLowerCase();
      if (head === 'ret' || head === 'retn' || head === 'reti') break;
    }

    routines.push({
      name: item.label.name,
      span: item.label.span,
      labels,
      instructions,
    });
  }

  return {
    routines,
    directCallTargets: [...targetSet].sort((a, b) => a.localeCompare(b)),
  };
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- test/registerCare/programModel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/registerCare/types.ts src/registerCare/programModel.ts test/registerCare/programModel.test.ts
git commit -m "feat: model register-care routine ranges"
```

## Task 5: Z80 Instruction Effects First Slice

**Files:**
- Modify: `src/registerCare/types.ts`
- Create: `src/z80/effects.ts`
- Create: `test/registerCare/effects.test.ts`

- [ ] **Step 1: Write effect tests**

Create `test/registerCare/effects.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { makeSourceFile, span } from '../../src/frontend/source.js';
import { parseAsmInstruction } from '../../src/frontend/parseAsmInstruction.js';
import { getZ80InstructionEffect } from '../../src/z80/effects.js';

function effect(text: string) {
  const diagnostics = [];
  const sf = makeSourceFile('/tmp/effects.z80', text);
  const inst = parseAsmInstruction('/tmp/effects.z80', text, span(sf, 0, text.length), diagnostics);
  if (!inst) throw new Error(`failed to parse ${text}: ${JSON.stringify(diagnostics)}`);
  return getZ80InstructionEffect(inst);
}

describe('Z80 register-care effects', () => {
  it('models LD HL,nn as writing H and L', () => {
    expect(effect('ld hl,$1234')).toMatchObject({ reads: [], writes: ['H', 'L'] });
  });

  it('models LD A,(DE) as reading D,E and writing A', () => {
    expect(effect('ld a,(de)')).toMatchObject({ reads: ['D', 'E'], writes: ['A'] });
  });

  it('models INC B as reading and writing B plus flags except carry', () => {
    expect(effect('inc b')).toMatchObject({
      reads: ['B'],
      writes: ['B', 'sign', 'zero', 'halfCarry', 'parity', 'negative'],
    });
  });

  it('models PUSH DE as reading D,E and pushing two stack bytes', () => {
    expect(effect('push de')).toMatchObject({
      reads: ['D', 'E'],
      writes: ['SPH', 'SPL'],
      stack: { kind: 'push', units: ['D', 'E'] },
    });
  });

  it('models POP HL as writing H,L and popping two stack bytes', () => {
    expect(effect('pop hl')).toMatchObject({
      writes: ['H', 'L', 'SPH', 'SPL'],
      stack: { kind: 'pop', units: ['H', 'L'] },
    });
  });

  it('models CALL target as a call boundary', () => {
    expect(effect('call HELPER')).toMatchObject({ control: { kind: 'call', target: 'HELPER' } });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/registerCare/effects.test.ts
```

Expected: FAIL because `src/z80/effects.ts` does not exist.

- [ ] **Step 3: Add effect types**

Extend `src/registerCare/types.ts`:

```ts
export type StackEffect =
  | { kind: 'none' }
  | { kind: 'push'; units: RegisterCareUnit[] }
  | { kind: 'pop'; units: RegisterCareUnit[] }
  | { kind: 'exchangeTop'; units: RegisterCareUnit[] }
  | { kind: 'unknown' };

export type ControlEffect =
  | { kind: 'fallthrough' }
  | { kind: 'call'; target?: string }
  | { kind: 'rst'; vector?: number }
  | { kind: 'return' }
  | { kind: 'jump'; target?: string; conditional: boolean }
  | { kind: 'unknown' };

export interface InstructionEffect {
  reads: RegisterCareUnit[];
  writes: RegisterCareUnit[];
  stack: StackEffect;
  control: ControlEffect;
}
```

- [ ] **Step 4: Implement the first effect table**

Create `src/z80/effects.ts` with focused helpers:

```ts
import type { AsmInstructionNode, AsmOperandNode } from '../frontend/ast.js';
import type { InstructionEffect, RegisterCareUnit } from '../registerCare/types.js';
import { expandCarrier } from '../registerCare/carriers.js';

const NO_EFFECT: InstructionEffect = {
  reads: [],
  writes: [],
  stack: { kind: 'none' },
  control: { kind: 'fallthrough' },
};

const INC_DEC_FLAGS: RegisterCareUnit[] = ['sign', 'zero', 'halfCarry', 'parity', 'negative'];
const ALU_FLAGS: RegisterCareUnit[] = ['sign', 'zero', 'halfCarry', 'parity', 'negative', 'carry'];

function unique(units: RegisterCareUnit[]): RegisterCareUnit[] {
  return [...new Set(units)];
}

function regUnits(op: AsmOperandNode | undefined): RegisterCareUnit[] {
  if (op?.kind !== 'Reg') return [];
  return expandCarrier(op.name) ?? [];
}

function memReads(op: AsmOperandNode | undefined): RegisterCareUnit[] {
  if (op?.kind !== 'Mem') return [];
  const expr = op.expr;
  if (expr.kind === 'EaName') return expandCarrier(expr.name) ?? [];
  if (expr.kind === 'EaAdd' || expr.kind === 'EaSub') {
    return expr.base.kind === 'EaName' ? (expandCarrier(expr.base.name) ?? []) : [];
  }
  return [];
}

function immTarget(op: AsmOperandNode | undefined): string | undefined {
  return op?.kind === 'Imm' && op.expr.kind === 'ImmName' ? op.expr.name : undefined;
}

function effect(reads: RegisterCareUnit[], writes: RegisterCareUnit[], rest?: Partial<InstructionEffect>): InstructionEffect {
  return {
    reads: unique(reads),
    writes: unique(writes),
    stack: rest?.stack ?? { kind: 'none' },
    control: rest?.control ?? { kind: 'fallthrough' },
  };
}

export function getZ80InstructionEffect(inst: AsmInstructionNode): InstructionEffect {
  const head = inst.head.toLowerCase();
  const first = inst.operands[0];
  const second = inst.operands[1];

  if (head === 'nop' || head === 'halt' || head === 'di' || head === 'ei') return NO_EFFECT;

  if (head === 'ld' && inst.operands.length === 2) {
    const dstRegs = regUnits(first);
    const srcRegs = regUnits(second);
    const srcMem = memReads(second);
    const dstMem = memReads(first);
    if (dstRegs.length > 0) return effect([...srcRegs, ...srcMem], dstRegs);
    if (first?.kind === 'Mem') return effect([...dstMem, ...srcRegs], []);
  }

  if ((head === 'inc' || head === 'dec') && inst.operands.length === 1) {
    const units = regUnits(first);
    return effect(units, [...units, ...INC_DEC_FLAGS]);
  }

  if (['add', 'adc', 'sbc', 'sub', 'and', 'or', 'xor', 'cp'].includes(head)) {
    const reads = [...regUnits(first), ...regUnits(second), ...memReads(first), ...memReads(second)];
    const writes = head === 'cp' ? ALU_FLAGS : [...regUnits(first), ...ALU_FLAGS];
    return effect(reads, writes);
  }

  if (head === 'push' && inst.operands.length === 1) {
    const units = regUnits(first);
    return effect(units, ['SPH', 'SPL'], { stack: { kind: 'push', units } });
  }

  if (head === 'pop' && inst.operands.length === 1) {
    const units = regUnits(first);
    return effect([], [...units, 'SPH', 'SPL'], { stack: { kind: 'pop', units } });
  }

  if (head === 'call') {
    return effect([], ['SPH', 'SPL'], { control: { kind: 'call', target: immTarget(first) } });
  }

  if (head === 'rst') {
    return effect([], ['SPH', 'SPL'], { control: { kind: 'rst' } });
  }

  if (head === 'ret' || head === 'retn' || head === 'reti') {
    return effect([], ['SPH', 'SPL'], { control: { kind: 'return' } });
  }

  if (head === 'jp' || head === 'jr' || head === 'djnz') {
    return effect(head === 'djnz' ? ['B'] : [], head === 'djnz' ? ['B'] : [], {
      control: { kind: 'jump', target: immTarget(inst.operands.at(-1)), conditional: inst.operands.length > 1 || head === 'djnz' },
    });
  }

  return { reads: [], writes: ['A', 'B', 'C', 'D', 'E', 'H', 'L', 'F'], stack: { kind: 'unknown' }, control: { kind: 'unknown' } };
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- test/registerCare/effects.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/registerCare/types.ts src/z80/effects.ts test/registerCare/effects.test.ts
git commit -m "feat: add first Z80 register-care effects"
```

## Task 6: Routine Summary Inference

**Files:**
- Modify: `src/registerCare/types.ts`
- Create: `src/registerCare/summary.ts`
- Create: `test/registerCare/summary.test.ts`

- [ ] **Step 1: Write summary tests**

Create `test/registerCare/summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { RegisterCareInstruction, RegisterCareRoutine } from '../../src/registerCare/types.js';
import { inferRoutineSummary } from '../../src/registerCare/summary.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { parseAsmInstruction } from '../../src/frontend/parseAsmInstruction.js';

function instruction(text: string, line: number): RegisterCareInstruction {
  const diagnostics = [];
  const sf = makeSourceFile('/tmp/summary.z80', text);
  const parsed = parseAsmInstruction('/tmp/summary.z80', text, span(sf, 0, text.length), diagnostics);
  if (!parsed) throw new Error(`parse failed: ${text}`);
  parsed.span.start.line = line;
  return { instruction: parsed, head: parsed.head, file: parsed.span.file, line, column: 1 };
}

function routine(lines: string[]): RegisterCareRoutine {
  const instructions = lines.map((line, idx) => instruction(line, idx + 1));
  return {
    name: 'ROUTINE',
    span: instructions[0]!.instruction.span,
    labels: ['ROUTINE'],
    instructions,
  };
}

describe('routine summary inference', () => {
  it('reports simple writes', () => {
    const summary = inferRoutineSummary(routine(['ld a,1', 'ret']));
    expect(summary.mayWrite).toContain('A');
    expect(summary.stackBalanced).toBe(true);
  });

  it('recognizes push/pop preservation through the stack', () => {
    const summary = inferRoutineSummary(routine(['push de', 'ld de,$1234', 'pop de', 'ret']));
    expect(summary.mayWrite).not.toContain('D');
    expect(summary.mayWrite).not.toContain('E');
    expect(summary.preserved).toEqual(expect.arrayContaining(['D', 'E']));
    expect(summary.stackBalanced).toBe(true);
  });

  it('tracks renaming through push/pop', () => {
    const summary = inferRoutineSummary(routine(['push de', 'pop hl', 'ret']));
    expect(summary.valueRelations).toContainEqual({ out: ['H', 'L'], from: ['D', 'E'] });
  });

  it('marks unbalanced stacks', () => {
    const summary = inferRoutineSummary(routine(['push hl', 'ret']));
    expect(summary.stackBalanced).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/registerCare/summary.test.ts
```

Expected: FAIL because `summary.ts` does not exist.

- [ ] **Step 3: Add summary types**

Extend `src/registerCare/types.ts`:

```ts
export interface ValueRelation {
  out: RegisterCareUnit[];
  from: RegisterCareUnit[];
}

export interface RoutineSummary {
  name: string;
  mayRead: RegisterCareUnit[];
  mayWrite: RegisterCareUnit[];
  preserved: RegisterCareUnit[];
  valueRelations: ValueRelation[];
  stackBalanced: boolean;
  hasUnknownStackEffect: boolean;
}
```

- [ ] **Step 4: Implement summary inference**

Create `src/registerCare/summary.ts`:

```ts
import { getZ80InstructionEffect } from '../z80/effects.js';
import type {
  RegisterCareRoutine,
  RegisterCareUnit,
  RoutineSummary,
  ValueRelation,
} from './types.js';

const TRACKED_UNITS: RegisterCareUnit[] = ['A', 'B', 'C', 'D', 'E', 'H', 'L', 'F'];

type Token = { origin: RegisterCareUnit } | { origin: 'unknown' };

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function tokenEquals(a: Token | undefined, b: Token | undefined): boolean {
  return !!a && !!b && a.origin === b.origin;
}

export function inferRoutineSummary(routine: RegisterCareRoutine): RoutineSummary {
  const tokens = new Map<RegisterCareUnit, Token>();
  for (const unit of TRACKED_UNITS) tokens.set(unit, { origin: unit });

  const stack: Token[][] = [];
  const mayRead: RegisterCareUnit[] = [];
  const mayWrite: RegisterCareUnit[] = [];
  let stackBalanced = true;
  let hasUnknownStackEffect = false;

  for (const item of routine.instructions) {
    const effect = getZ80InstructionEffect(item.instruction);
    mayRead.push(...effect.reads);

    if (effect.stack.kind === 'push') {
      stack.push(effect.stack.units.map((unit) => tokens.get(unit) ?? { origin: 'unknown' }));
    } else if (effect.stack.kind === 'pop') {
      const popped = stack.pop();
      if (!popped) {
        stackBalanced = false;
        for (const unit of effect.stack.units) tokens.set(unit, { origin: 'unknown' });
      } else {
        effect.stack.units.forEach((unit, idx) => {
          tokens.set(unit, popped[idx] ?? { origin: 'unknown' });
        });
      }
    } else if (effect.stack.kind === 'unknown') {
      hasUnknownStackEffect = true;
    }

    for (const unit of effect.writes) {
      if (effect.stack.kind === 'pop' && effect.stack.units.includes(unit)) continue;
      if (unit === 'SPH' || unit === 'SPL') continue;
      tokens.set(unit, { origin: 'unknown' });
    }
  }

  if (stack.length !== 0) stackBalanced = false;

  const preserved: RegisterCareUnit[] = [];
  const valueRelations: ValueRelation[] = [];
  for (const unit of TRACKED_UNITS) {
    const current = tokens.get(unit);
    if (tokenEquals(current, { origin: unit })) {
      preserved.push(unit);
    } else {
      mayWrite.push(unit);
      if (current && current.origin !== 'unknown') {
        valueRelations.push({ out: [unit], from: [current.origin] });
      }
    }
  }

  const pairRelation = (out: RegisterCareUnit[], from: RegisterCareUnit[]): ValueRelation | undefined => {
    const ok = out.every((unit, idx) => tokens.get(unit)?.origin === from[idx]);
    return ok ? { out, from } : undefined;
  };
  const hlFromDe = pairRelation(['H', 'L'], ['D', 'E']);
  if (hlFromDe) valueRelations.push(hlFromDe);

  return {
    name: routine.name,
    mayRead: unique(mayRead),
    mayWrite: unique(mayWrite),
    preserved: unique(preserved),
    valueRelations,
    stackBalanced,
    hasUnknownStackEffect,
  };
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- test/registerCare/summary.test.ts test/registerCare/effects.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/registerCare/types.ts src/registerCare/summary.ts test/registerCare/summary.test.ts
git commit -m "feat: infer register-care routine summaries"
```

## Task 7: Report Rendering And Generated Contracts

**Files:**
- Create: `src/registerCare/report.ts`
- Modify: `src/registerCare/analyze.ts`
- Create: `test/registerCare/report.test.ts`
- Modify: `test/registerCare/integration.test.ts`

- [ ] **Step 1: Write report tests**

Create `test/registerCare/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { renderRegisterCareReport, renderRegisterCareInterface } from '../../src/registerCare/report.js';

describe('register-care reports', () => {
  it('renders routine summaries deterministically', () => {
    const text = renderRegisterCareReport({
      entryFile: '/tmp/main.z80',
      mode: 'audit',
      summaries: [
        {
          name: 'HELPER',
          mayRead: ['D', 'E'],
          mayWrite: ['A', 'F'],
          preserved: ['B', 'C', 'D', 'E', 'H', 'L'],
          valueRelations: [],
          stackBalanced: true,
          hasUnknownStackEffect: false,
        },
      ],
      conflicts: [],
      unknownCalls: [],
    });

    expect(text).toContain('Routine: HELPER');
    expect(text).toContain('reads: D,E');
    expect(text).toContain('writes: A,F');
    expect(text).toContain('stack: balanced');
  });

  it('renders generated smart-comment contracts', () => {
    const text = renderRegisterCareInterface([
      {
        name: 'HELPER',
        mayRead: ['D', 'E'],
        mayWrite: ['A', 'F'],
        preserved: ['B', 'C', 'D', 'E', 'H', 'L'],
        valueRelations: [],
        stackBalanced: true,
        hasUnknownStackEffect: false,
      },
    ]);

    expect(text).toContain(';! @proc       HELPER');
    expect(text).toContain(';! @clobbers   {A,F}');
    expect(text).toContain(';! @preserves  {B,C,D,E,H,L}');
    expect(text).toContain(';! @end');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/registerCare/report.test.ts
```

Expected: FAIL because `report.ts` does not exist.

- [ ] **Step 3: Add report types**

Extend `src/registerCare/types.ts`:

```ts
export interface RegisterCareConflict {
  file: string;
  line: number;
  column: number;
  callTarget: string;
  carriers: RegisterCareUnit[];
  message: string;
}

export interface RegisterCareReportModel {
  entryFile: string;
  mode: RegisterCareMode;
  summaries: RoutineSummary[];
  conflicts: RegisterCareConflict[];
  unknownCalls: string[];
}
```

- [ ] **Step 4: Implement report rendering**

Create `src/registerCare/report.ts`:

```ts
import type { RegisterCareReportModel, RegisterCareUnit, RoutineSummary } from './types.js';

function list(units: RegisterCareUnit[]): string {
  return units.length === 0 ? '-' : units.join(',');
}

export function renderRegisterCareReport(model: RegisterCareReportModel): string {
  const lines = ['AZM Register-Care Report', `Entry: ${model.entryFile}`, `Mode: ${model.mode}`, ''];
  for (const summary of model.summaries) {
    lines.push(`Routine: ${summary.name}`);
    lines.push(`  reads: ${list(summary.mayRead)}`);
    lines.push(`  writes: ${list(summary.mayWrite)}`);
    lines.push(`  preserves: ${list(summary.preserved)}`);
    lines.push(`  stack: ${summary.stackBalanced ? 'balanced' : 'unbalanced'}`);
    if (summary.valueRelations.length > 0) {
      for (const rel of summary.valueRelations) {
        lines.push(`  relation: ${list(rel.out)} <= ${list(rel.from)}`);
      }
    }
    lines.push('');
  }
  if (model.conflicts.length > 0) {
    lines.push('Conflicts:');
    for (const conflict of model.conflicts) {
      lines.push(`  ${conflict.file}:${conflict.line}:${conflict.column}: ${conflict.message}`);
    }
    lines.push('');
  }
  if (model.unknownCalls.length > 0) {
    lines.push('Unknown calls:');
    for (const call of model.unknownCalls) lines.push(`  ${call}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function renderRegisterCareInterface(summaries: RoutineSummary[]): string {
  const lines = ['; AZM register-care interface', '; Generated from inferred routine summaries.', ''];
  for (const summary of summaries) {
    lines.push(`;! @proc       ${summary.name}`);
    if (summary.mayRead.length > 0) lines.push(`;! @in         {${list(summary.mayRead)}}`);
    if (summary.mayWrite.length > 0) lines.push(`;! @clobbers   {${list(summary.mayWrite)}}`);
    if (summary.preserved.length > 0) lines.push(`;! @preserves  {${list(summary.preserved)}}`);
    lines.push(';! @end');
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
```

- [ ] **Step 5: Wire real report data in `analyze.ts`**

Replace the stub in `src/registerCare/analyze.ts` with:

```ts
import { buildRegisterCareProgramModel } from './programModel.js';
import { inferRoutineSummary } from './summary.js';
import { renderRegisterCareInterface, renderRegisterCareReport } from './report.js';

// keep existing imports and interfaces

export function analyzeRegisterCare(
  loaded: LoadedProgram,
  options: AnalyzeRegisterCareOptions,
): AnalyzeRegisterCareResult {
  const model = buildRegisterCareProgramModel(loaded.program);
  const summaries = model.routines.map(inferRoutineSummary);
  const reportModel = {
    entryFile: loaded.program.entryFile,
    mode: options.mode,
    summaries,
    conflicts: [],
    unknownCalls: [],
  };

  return {
    diagnostics: [],
    ...(options.emitReport ? { reportText: renderRegisterCareReport(reportModel) } : {}),
    ...(options.emitInterface ? { interfaceText: renderRegisterCareInterface(summaries) } : {}),
  };
}
```

- [ ] **Step 6: Extend integration test**

Add to `test/registerCare/integration.test.ts`:

```ts
  it('includes inferred called routine summaries in the report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-summary-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      ['START:', '    call HELPER', '    ret', 'HELPER:', '    ld a,1', '    ret', '.end'].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'audit',
        emitRegisterReport: true,
      },
      { formats: defaultFormatWriters },
    );

    const report = res.artifacts.find(
      (a): a is RegisterCareReportArtifact => a.kind === 'register-care-report',
    );
    expect(report?.text).toContain('Routine: HELPER');
    expect(report?.text).toContain('writes: A');
  });
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- test/registerCare/report.test.ts test/registerCare/integration.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/registerCare/report.ts src/registerCare/analyze.ts src/registerCare/types.ts test/registerCare/report.test.ts test/registerCare/integration.test.ts
git commit -m "feat: render register-care summaries"
```

## Task 8: Direct-Call Liveness Conflicts

**Files:**
- Create: `src/registerCare/liveness.ts`
- Modify: `src/registerCare/analyze.ts`
- Modify: `src/diagnosticTypes.ts`
- Create: `test/registerCare/liveness.test.ts`
- Modify: `test/registerCare/integration.test.ts`

- [ ] **Step 1: Write liveness tests**

Create `test/registerCare/liveness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { RegisterCareInstruction, RegisterCareRoutine, RoutineSummary } from '../../src/registerCare/types.js';
import { findRegisterCareConflicts } from '../../src/registerCare/liveness.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { parseAsmInstruction } from '../../src/frontend/parseAsmInstruction.js';

function instruction(text: string, line: number): RegisterCareInstruction {
  const diagnostics = [];
  const sf = makeSourceFile('/tmp/liveness.z80', text);
  const parsed = parseAsmInstruction('/tmp/liveness.z80', text, span(sf, 0, text.length), diagnostics);
  if (!parsed) throw new Error(`parse failed: ${text}`);
  parsed.span.start.line = line;
  return { instruction: parsed, head: parsed.head, file: parsed.span.file, line, column: 1 };
}

function caller(lines: string[]): RegisterCareRoutine {
  const instructions = lines.map((line, idx) => instruction(line, idx + 1));
  return { name: 'CALLER', span: instructions[0]!.instruction.span, labels: ['CALLER'], instructions };
}

const callee: RoutineSummary = {
  name: 'HELPER',
  mayRead: [],
  mayWrite: ['D', 'E'],
  preserved: ['A', 'B', 'C', 'H', 'L', 'F'],
  valueRelations: [],
  stackBalanced: true,
  hasUnknownStackEffect: false,
};

describe('register-care liveness conflicts', () => {
  it('reports when a call clobbers a later-read pre-call value', () => {
    const conflicts = findRegisterCareConflicts(caller(['ld de,$1000', 'call HELPER', 'inc de', 'ret']), new Map([['HELPER', callee]]), []);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.carriers).toEqual(['D', 'E']);
  });

  it('does not report when the value is overwritten before later use', () => {
    const conflicts = findRegisterCareConflicts(caller(['ld de,$1000', 'call HELPER', 'ld de,$2000', 'inc de', 'ret']), new Map([['HELPER', callee]]), []);
    expect(conflicts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/registerCare/liveness.test.ts
```

Expected: FAIL because `liveness.ts` does not exist.

- [ ] **Step 3: Add diagnostic IDs**

In `src/diagnosticTypes.ts`, add:

```ts
  /** Register-care conflict where a call may destroy a live caller value. */
  RegisterCareConflict: 'ZAX600',

  /** Register-care analysis cannot prove an external or indirect call contract. */
  RegisterCareUnknownBoundary: 'ZAX601',
```

- [ ] **Step 4: Implement direct-call liveness**

Create `src/registerCare/liveness.ts`:

```ts
import { DiagnosticIds, type Diagnostic } from '../diagnosticTypes.js';
import { getZ80InstructionEffect } from '../z80/effects.js';
import type {
  LocatedSmartComment,
  RegisterCareConflict,
  RegisterCareRoutine,
  RegisterCareUnit,
  RoutineSummary,
} from './types.js';

function unique(units: RegisterCareUnit[]): RegisterCareUnit[] {
  return [...new Set(units)];
}

function directCallTarget(item: RegisterCareRoutine['instructions'][number]): string | undefined {
  const inst = item.instruction;
  if (inst.head.toLowerCase() !== 'call' || inst.operands.length !== 1) return undefined;
  const op = inst.operands[0];
  return op?.kind === 'Imm' && op.expr.kind === 'ImmName' ? op.expr.name : undefined;
}

function hintUnitsForLine(hints: LocatedSmartComment[], file: string, callLine: number): RegisterCareUnit[] {
  const prior = hints.find((h) => h.file === file && h.line === callLine - 1 && h.comment.kind === 'expectOut');
  return prior && prior.comment.kind === 'expectOut' ? prior.comment.carriers : [];
}

export function findRegisterCareConflicts(
  routine: RegisterCareRoutine,
  summaries: Map<string, RoutineSummary>,
  hints: LocatedSmartComment[],
): RegisterCareConflict[] {
  const conflicts: RegisterCareConflict[] = [];
  const live = new Set<RegisterCareUnit>();

  for (let i = routine.instructions.length - 1; i >= 0; i--) {
    const item = routine.instructions[i]!;
    const effect = getZ80InstructionEffect(item.instruction);
    const target = directCallTarget(item);
    if (target) {
      const summary = summaries.get(target);
      if (summary) {
        const accepted = new Set(hintUnitsForLine(hints, item.file, item.line));
        const killed = summary.mayWrite.filter((unit) => live.has(unit) && !accepted.has(unit));
        if (killed.length > 0) {
          conflicts.push({
            file: item.file,
            line: item.line,
            column: item.column,
            callTarget: target,
            carriers: unique(killed),
            message: `CALL ${target} may modify ${unique(killed).join(',')}, but the pre-call value is used later.`,
          });
        }
      }
    }

    for (const unit of effect.writes) live.delete(unit);
    for (const unit of effect.reads) live.add(unit);
  }

  return conflicts.reverse();
}

export function diagnosticsForRegisterCareConflicts(
  conflicts: RegisterCareConflict[],
  severity: 'warning' | 'error',
): Diagnostic[] {
  return conflicts.map((conflict) => ({
    id: DiagnosticIds.RegisterCareConflict,
    severity,
    message: conflict.message,
    file: conflict.file,
    line: conflict.line,
    column: conflict.column,
  }));
}
```

- [ ] **Step 5: Wire liveness into analyzer**

In `src/registerCare/analyze.ts`, import:

```ts
import { diagnosticsForRegisterCareConflicts, findRegisterCareConflicts } from './liveness.js';
import { parseSmartComments } from './smartComments.js';
```

Build summary map and conflicts:

```ts
  const smartComments = parseSmartComments(loaded.sourceLineComments);
  const summaryMap = new Map(summaries.map((summary) => [summary.name, summary]));
  const conflicts = model.routines.flatMap((routine) =>
    findRegisterCareConflicts(routine, summaryMap, smartComments),
  );
  const diagnostics =
    options.mode === 'warn' || options.mode === 'strict'
      ? diagnosticsForRegisterCareConflicts(conflicts, 'warning')
      : options.mode === 'error'
        ? diagnosticsForRegisterCareConflicts(conflicts, 'error')
        : [];
```

Use `conflicts` in the report model and return `diagnostics`.

- [ ] **Step 6: Add integration tests for modes**

Add to `test/registerCare/integration.test.ts`:

```ts
  it('warns on direct-call conflicts in warn mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-warn-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      ['START:', '    ld de,$1000', '    call HELPER', '    inc de', '    ret', 'HELPER:', '    ld de,$2000', '    ret', '.end'].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitD8m: false, emitListing: false, registerCare: 'warn' },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('CALL HELPER may modify D,E'),
      }),
    );
  });

  it('fails on direct-call conflicts in error mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-error-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      ['START:', '    ld de,$1000', '    call HELPER', '    inc de', '    ret', 'HELPER:', '    ld de,$2000', '    ret', '.end'].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitD8m: false, emitListing: false, registerCare: 'error' },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error' }));
  });
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- test/registerCare/liveness.test.ts test/registerCare/integration.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/diagnosticTypes.ts src/registerCare/liveness.ts src/registerCare/analyze.ts test/registerCare/liveness.test.ts test/registerCare/integration.test.ts
git commit -m "feat: detect direct-call register-care conflicts"
```

## Task 9: Smart Contracts And Caller Hints

**Files:**
- Modify: `src/registerCare/types.ts`
- Modify: `src/registerCare/smartComments.ts`
- Modify: `src/registerCare/summary.ts`
- Modify: `src/registerCare/analyze.ts`
- Modify: `test/registerCare/smartComments.test.ts`
- Modify: `test/registerCare/integration.test.ts`

- [ ] **Step 1: Add integration tests for contracts and hints**

Add to `test/registerCare/integration.test.ts`:

```ts
  it('treats matching @in and @out on the same carrier as transformed output intent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-contract-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld de,$1000',
        '    call NORMALISE',
        '    inc de',
        '    ret',
        ';! @proc NORMALISE',
        ';! @in {DE} raw',
        ';! @out {DE} normalized',
        ';! @clobbers {A,F}',
        ';! @end',
        'NORMALISE:',
        '    ld de,$2000',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitD8m: false, emitListing: false, registerCare: 'error' },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('suppresses one ambiguous call with @expect-out', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-hint-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld de,$1000',
        '    ;! @expect-out {DE} normalized',
        '    call HELPER',
        '    inc de',
        '    ret',
        'HELPER:',
        '    ld de,$2000',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitD8m: false, emitListing: false, registerCare: 'error' },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- test/registerCare/integration.test.ts
```

Expected: the contract case fails because contracts do not yet override inferred summary semantics.

- [ ] **Step 3: Add contract model types**

Extend `src/registerCare/types.ts`:

```ts
export interface RoutineContract {
  name: string;
  in: RegisterCareUnit[];
  out: RegisterCareUnit[];
  clobbers: RegisterCareUnit[];
  preserves: RegisterCareUnit[];
}
```

- [ ] **Step 4: Build contracts from smart comments**

In `src/registerCare/smartComments.ts`, add:

```ts
import type { RoutineContract } from './types.js';

export function buildRoutineContracts(comments: LocatedSmartComment[]): Map<string, RoutineContract> {
  const contracts = new Map<string, RoutineContract>();
  let current: RoutineContract | undefined;

  for (const item of comments) {
    const comment = item.comment;
    if (comment.kind === 'proc' || comment.kind === 'extern') {
      current = { name: comment.name, in: [], out: [], clobbers: [], preserves: [] };
      contracts.set(comment.name, current);
      continue;
    }
    if (comment.kind === 'end') {
      current = undefined;
      continue;
    }
    if (!current) continue;
    if (comment.kind === 'in') current.in.push(...comment.carriers);
    if (comment.kind === 'out') current.out.push(...comment.carriers);
    if (comment.kind === 'clobbers') current.clobbers.push(...comment.carriers);
    if (comment.kind === 'preserves') current.preserves.push(...comment.carriers);
  }

  return contracts;
}
```

- [ ] **Step 5: Apply contracts to summaries**

In `src/registerCare/summary.ts`, add:

```ts
import type { RoutineContract } from './types.js';

export function applyRoutineContract(summary: RoutineSummary, contract: RoutineContract): RoutineSummary {
  const transformed = new Set(contract.in.filter((unit) => contract.out.includes(unit)));
  const mayWrite = summary.mayWrite.filter((unit) => !transformed.has(unit));
  for (const unit of contract.clobbers) {
    if (!mayWrite.includes(unit)) mayWrite.push(unit);
  }
  const preserved = [...new Set([...summary.preserved, ...contract.preserves])];
  return { ...summary, mayRead: [...new Set([...summary.mayRead, ...contract.in])], mayWrite, preserved };
}
```

This first behavior treats matching `@in`/`@out` as intentional transformed output and avoids preservation conflicts for that carrier.

- [ ] **Step 6: Wire contracts into analyzer**

In `src/registerCare/analyze.ts`, import `buildRoutineContracts` and `applyRoutineContract`.

Build summaries as:

```ts
  const smartComments = parseSmartComments(loaded.sourceLineComments);
  const contracts = buildRoutineContracts(smartComments);
  const summaries = model.routines.map((routine) => {
    const inferred = inferRoutineSummary(routine);
    const contract = contracts.get(routine.name);
    return contract ? applyRoutineContract(inferred, contract) : inferred;
  });
```

Remove the older duplicate `parseSmartComments` call if present.

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- test/registerCare/smartComments.test.ts test/registerCare/integration.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/registerCare/types.ts src/registerCare/smartComments.ts src/registerCare/summary.ts src/registerCare/analyze.ts test/registerCare/smartComments.test.ts test/registerCare/integration.test.ts
git commit -m "feat: honor register-care contracts and hints"
```

## Task 10: External Calls, RST, And MON-3 Profile Skeleton

**Files:**
- Create: `src/registerCare/profiles.ts`
- Modify: `src/registerCare/liveness.ts`
- Modify: `src/registerCare/analyze.ts`
- Modify: `test/registerCare/integration.test.ts`

- [ ] **Step 1: Add profile tests**

Add to `test/registerCare/integration.test.ts`:

```ts
  it('uses the MON-3 profile for RST boundaries in register reports', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-mon3-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(entry, ['START:', '    rst $10', '    ret', '.end'].join('\n'), 'utf8');

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'audit',
        emitRegisterReport: true,
        registerCareProfile: 'mon3',
      },
      { formats: defaultFormatWriters },
    );

    const report = res.artifacts.find(
      (a): a is RegisterCareReportArtifact => a.kind === 'register-care-report',
    );
    expect(report?.text).toContain('Profile: mon3');
  });
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/registerCare/integration.test.ts
```

Expected: FAIL because reports do not include profiles.

- [ ] **Step 3: Create profile skeleton**

Create `src/registerCare/profiles.ts`:

```ts
import type { RoutineSummary } from './types.js';

export type RegisterCareProfileName = 'mon3';

export interface RegisterCareProfile {
  name: RegisterCareProfileName;
  rst: Map<number, RoutineSummary>;
}

export function getRegisterCareProfile(name: RegisterCareProfileName | undefined): RegisterCareProfile | undefined {
  if (name !== 'mon3') return undefined;
  return {
    name: 'mon3',
    rst: new Map([
      [
        0x10,
        {
          name: 'RST_$10',
          mayRead: [],
          mayWrite: ['A', 'F'],
          preserved: ['B', 'C', 'D', 'E', 'H', 'L'],
          valueRelations: [],
          stackBalanced: true,
          hasUnknownStackEffect: false,
        },
      ],
    ]),
  };
}
```

- [ ] **Step 4: Add profile to report model**

Extend `RegisterCareReportModel` in `src/registerCare/types.ts`:

```ts
profile?: string;
```

In `src/registerCare/report.ts`, after mode:

```ts
  if (model.profile) lines.push(`Profile: ${model.profile}`);
```

- [ ] **Step 5: Wire profile in analyzer**

In `src/registerCare/analyze.ts`:

```ts
import { getRegisterCareProfile } from './profiles.js';
```

Then:

```ts
  const profile = getRegisterCareProfile(options.profile);
```

Set `profile: profile?.name` in the report model.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- test/registerCare/integration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/registerCare/profiles.ts src/registerCare/types.ts src/registerCare/report.ts src/registerCare/analyze.ts test/registerCare/integration.test.ts
git commit -m "feat: add register-care profile skeleton"
```

## Task 11: Register Interface Artifact

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/registerCare/analyze.ts`
- Modify: `test/registerCare/integration.test.ts`
- Modify: `test/cli/register_care_cli.test.ts`

- [ ] **Step 1: Write interface artifact tests**

Add to `test/registerCare/integration.test.ts`:

```ts
  it('emits inferred smart-comment interface artifacts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-interface-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      ['START:', '    call HELPER', '    ret', 'HELPER:', '    ld a,1', '    ret', '.end'].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'audit',
        emitRegisterInterface: true,
      },
      { formats: defaultFormatWriters },
    );

    const artifact = res.artifacts.find((a) => a.kind === 'register-care-interface');
    expect(artifact && 'text' in artifact ? artifact.text : '').toContain(';! @proc       HELPER');
  });
```

Add to `test/cli/register_care_cli.test.ts`:

```ts
  it('writes a .azmi artifact when requested', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-cli-interface-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      ['START:', '    call HELPER', '    ret', 'HELPER:', '    ld a,1', '    ret', '.end'].join('\n'),
      'utf8',
    );

    const code = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--register-care',
      'audit',
      '--emit-register-interface',
      entry,
    ]);

    expect(code).toBe(0);
    expect(readFileSync(join(dir, 'main.azmi'), 'utf8')).toContain(';! @proc       HELPER');
  });
```

- [ ] **Step 2: Run tests**

Run:

```bash
npm test -- test/registerCare/integration.test.ts test/cli/register_care_cli.test.ts
```

Expected: PASS if Task 1 and Task 7 interface plumbing is already correct. If it fails, fix only the artifact path/flag wiring.

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts src/registerCare/analyze.ts test/registerCare/integration.test.ts test/cli/register_care_cli.test.ts
git commit -m "feat: emit register-care interface artifacts"
```

## Task 12: Verification And Baseline Guardrails

**Files:**
- Modify: `docs/reference/testing-verification-guide.md`
- Modify: `docs/design/azm-register-care-safety.md`

- [ ] **Step 1: Document commands**

Add to `docs/reference/testing-verification-guide.md`:

```markdown
### Register-Care Audit

Run register-care analysis without changing ASM80-compatible output:

```bash
npm run zax -- --register-care audit --emit-register-report path/to/source.z80
```

This writes `path/to/source.regcare.txt`. The default mode remains `off`, so existing ASM80 compatibility checks are unchanged unless a register-care flag is supplied.
```
```

- [ ] **Step 2: Update design doc status**

In `docs/design/azm-register-care-safety.md`, add a short implementation status section:

```markdown
## Implementation status

The first implementation target is `--register-care audit` plus `--emit-register-report`. This mode emits routine summaries and high-confidence direct-call conflicts without changing generated machine code. Warning and error modes use the same analysis results after the audit report has been validated against real ASM80 corpora.
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- test/registerCare test/cli/register_care_cli.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Run ASM80 baseline smoke**

Run:

```bash
npm test -- test/asm80/asm80_baseline_workflow.test.ts test/asm80/mon3_acceptance.test.ts
```

Expected: PASS or documented local skip for opt-in external acceptance. No register-care flags should be required.

- [ ] **Step 6: Commit docs**

```bash
git add docs/reference/testing-verification-guide.md docs/design/azm-register-care-safety.md
git commit -m "docs: document register-care audit workflow"
```

## Execution Notes

- Keep `registerCare` defaulting to `off`.
- Do not alter emitted BIN/HEX/LST output when register-care is disabled.
- Treat `audit` as non-failing even when conflicts are found.
- Treat `warn` as compiler warnings.
- Treat `error` as compiler errors for high-confidence conflicts only.
- Reserve `strict` for a follow-up plan that fails on unknown external calls and missing contracts.
- Prefer many small commits. Each task above should leave the tree testable.

## Self-Review

- Spec coverage: this plan covers smart-comment notation, callee contracts as documentation, caller hints as intent overrides, routine summary reports, generated interface artifacts, direct-call diagnostics, stack token basics, and MON-3 profile scaffolding.
- Scope boundary: full memory aliasing, interrupts, path-sensitive control flow, and behavior-changing autofix are excluded from this first build plan.
- Type consistency: option names are `registerCare`, `emitRegisterReport`, `emitRegisterInterface`, and `registerCareProfile`; artifact kinds are `register-care-report` and `register-care-interface`.
