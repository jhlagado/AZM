/**
 * Boundary / edge coverage for the lowering pipeline (#1134).
 *
 * Each test targets a resource or correctness limit (frame size, field counts,
 * index endpoints, ABI-ish parameter counts, empty bodies, recursion) so
 * regressions in frame layout, EA resolution, or diagnostics show up in CI.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { compilePlacedProgram } from '../helpers/lowered_program.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';

function writeTempEntry(source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'zax-boundary-'));
  const entry = join(dir, 'entry.zax');
  writeFileSync(entry, source, 'utf8');
  return {
    entry,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe('lowering boundary conditions (#1134)', () => {
  it('accepts a function with zero typed locals (frame fast path without local slots)', async () => {
    const { entry, cleanup } = writeTempEntry(
      `export func main(): HL
  hl := 0
end
`,
    );
    try {
      const { diagnostics } = await compilePlacedProgram(entry);
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('rejects IX-relative frame slots past -128 bytes (65 word locals touching the deepest slot)', async () => {
    const lines: string[] = ['export func main(): HL', '  var'];
    for (let i = 0; i < 65; i++) {
      const n = i.toString().padStart(2, '0');
      lines.push(`    v${n}: word = 0`);
    }
    lines.push('  end', '  ld a, (ix+v64)', '  hl := 0', 'end');
    const { entry, cleanup } = writeTempEntry(lines.join('\n'));
    try {
      const res = await compile(entry, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        id: DiagnosticIds.EmitError,
        severity: 'error',
        messageIncludes: 'IX/IY displacement out of range',
        line: 69,
      });
    } finally {
      cleanup();
    }
  });

  it('compiles structs with 1, 10, and 50 scalar fields (layout stress)', async () => {
    const mk = (n: number) => {
      const fields = Array.from({ length: n }, (_, i) => `  f${i}: byte`);
      return `type R${n}
${fields.join('\n')}
end

section data vars at $7000
  g${n}: R${n}
end

export func main(): HL
  a := g${n}.f0
  a := g${n}.f${n - 1}
  hl := 0
end
`;
    };
    for (const n of [1, 10, 50]) {
      const { entry, cleanup } = writeTempEntry(mk(n));
      try {
        const { diagnostics } = await compilePlacedProgram(entry);
        expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      } finally {
        cleanup();
      }
    }
  });

  it('lowers array index endpoints: 0, 1, length-2, length-1 for a fixed-length byte array', async () => {
    const { entry, cleanup } = writeTempEntry(
      `section data vars at $6000
  buf: byte[8] = [0, 0, 0, 0, 0, 0, 0, 0]
end

export func main(): HL
  a := buf[0]
  a := buf[1]
  a := buf[6]
  a := buf[7]
  hl := 0
end
`,
    );
    try {
      const { diagnostics } = await compilePlacedProgram(entry);
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('lowers three-level nested record field access', async () => {
    const { entry, cleanup } = writeTempEntry(
      `type Inner
  v: byte
end

type Mid
  inner: Inner
end

type Outer
  mid: Mid
end

section data vars at $5000
  o: Outer
end

export func main(): HL
  a := o.mid.inner.v
  hl := 0
end
`,
    );
    try {
      const { diagnostics } = await compilePlacedProgram(entry);
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('covers parameter boundary: zero-arity callee vs many word parameters', async () => {
    const params = Array.from({ length: 12 }, (_, i) => `p${i}: word`).join(', ');
    const { entry, cleanup } = writeTempEntry(
      `func f()
  ret
end

func many(${params}): HL
  hl := p0
  hl := p11
end

export func main(): HL
  f
  many 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
  hl := 0
end
`,
    );
    try {
      const res = await compile(
        entry,
        { emitAsm80: true, emitBin: true, emitHex: false, emitListing: false, emitD8m: false },
        { formats: defaultFormatWriters },
      );
      expect(
        res.diagnostics.filter((d) => d.severity === 'error'),
        res.diagnostics.map((d) => `${d.severity}: ${d.message}`).join(' | '),
      ).toEqual([]);
      const { diagnostics } = await compilePlacedProgram(entry);
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('accepts an empty statement body (only implicit control flow)', async () => {
    const { entry, cleanup } = writeTempEntry(
      `export func main()
end
`,
    );
    try {
      const pre = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(
        pre.diagnostics.filter((d) => d.severity === 'error'),
        pre.diagnostics.map((d) => d.message).join(' | '),
      ).toEqual([]);
      const { diagnostics } = await compilePlacedProgram(entry);
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('lowers direct recursion (stack frame re-entrant path)', async () => {
    const { entry, cleanup } = writeTempEntry(
      `func walk(n: byte)
  ld a, (n)
  or a
  if nz
    walk 0
  end
end

export func main(): HL
  walk 1
  hl := 0
end
`,
    );
    try {
      const pre = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(
        pre.diagnostics.filter((d) => d.severity === 'error'),
        pre.diagnostics.map((d) => d.message).join(' | '),
      ).toEqual([]);
      const { diagnostics } = await compilePlacedProgram(entry);
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('rejects a byte local initializer outside the byte range (diagnostic, not silent wrap)', async () => {
    const { entry, cleanup } = writeTempEntry(
      `export func main(): HL
  var
    b: byte = 400
  end
  hl := 0
end
`,
    );
    try {
      const res = await compile(entry, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        id: DiagnosticIds.EmitError,
        severity: 'error',
        messageIncludes: 'does not fit',
        line: 3,
      });
    } finally {
      cleanup();
    }
  });
});
