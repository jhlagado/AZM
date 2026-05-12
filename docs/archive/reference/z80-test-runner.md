# Z80 Headless Test Runner (Design Note)

This document defines a minimal, deterministic test ABI and runner contract for executing ZAX-assembled test binaries on a headless Z80 emulator.

## Goals

- Deterministic, headless execution for unit-style tests.
- Minimal ABI: explicit result code and optional message.
- Multiple assertions per binary, single HALT at end.
- Works with the default Simple platform; platform-specific runs are opt-in.

## Test ABI

- Memory map defaults (override per test if needed):
  - `RESULT_ADDR = $FF00` (word). `0` = pass. First nonzero written = fail code.
  - `FAIL_SEEN  = $FF02` (byte). `0` = none, `1` = failure recorded.
  - `MSG_ADDR   = $FF10` (optional null-terminated message).
- CPU init: regs=0, flags reset, interrupts disabled, `SP` set to top of RAM (configurable), `PC` at entry (default `$0000`).
- End-of-test: HALT (runner stops) or timeout → fail code `0xFF`.

## ZAX Helper (ops/functions)

Include a small helper to standardize assertions. Suggested helpers (ops, inline):

```zax
const RESULT_ADDR = $FF00
const FAIL_SEEN   = $FF02

op test_begin()
  ld hl, 0
  ld (RESULT_ADDR), hl
  ld a, 0
  ld (FAIL_SEEN), a
end

op fail(code: word)
  ld a, (FAIL_SEEN)
  or a
  ret nz               ; first failure wins
  ld (RESULT_ADDR), code
  ld a, 1
  ld (FAIL_SEEN), a
  ret
end

op assert_eq_word(expected: word, actual: word, code: word)
  ld hl, actual
  ld de, expected
  or a
  sbc hl, de
  jr z, :ok
  fail code
:ok
end

op test_end()
  halt
end
```

Usage in a test:

```zax
org $0000
start:
  ld sp, $FFFE
  test_begin
  assert_eq_word $1234, $1234, 1
  assert_eq_word $1111, $2222, 2   ; records code=2 but continues
  test_end
end
```

## Runner contract

- Loads BIN/HEX at a configurable base; zeroes RAM.
- Runs until HALT or timeout; abort on illegal opcode.
- On stop: reads `RESULT_ADDR` (word). If `0`, pass; else fail with that code. Optionally reads `MSG_ADDR`.
- Outputs TAP or JSON: `{name, result, code, message?, cycles?, instructions?}`.

## Platforms

- Default: `--platform simple` (no peripherals; plain ROM/RAM map).
- Opt-in: `--platform tec1`, `--platform tec1g`, etc., which load ROM images and memory maps. Tests targeting ROM entry points should call via `extern` to known ROM addresses; runner just maps ROM and RAM.

## CLI sketch

```
zax-test run tests/**/*.bin \
  --platform simple \
  --base 0x0000 --entry 0x0000 --timeout-cycles 5_000_000 \
  --result-addr 0xFF00 --msg-addr 0xFF10 \
  --format tap
```

Per-test overrides via sidecar JSON/YAML (base, entry, timeout, platform, ROM path).

## CI integration

- Build tests → emit BIN/HEX → `zax-test run --format tap`.
- Fail CI on any nonzero result or timeout.
- Parallelize runs if desired (one process per test).

## Open decisions

- Final default addresses (`FF00/FF02/FF10` proposed).
- Whether to ship helpers as ops (inline) or functions (typed, callee-save); above uses ops.
- Size of optional failure trace (last N instructions/register dump) in runner output.
