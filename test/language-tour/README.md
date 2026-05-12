# ZAX Language Tour (Source-Only)

This set is organized by feature and kept as side-by-side source plus lowered output.

Per example:

- `.zax` source
- generated `.z80` lowered output

## Order

0. `00_call_with_arg_and_local_baseline.zax`
   - minimal `main -> func(arg)` with one local
   - baseline for observing frame/call lowering behavior against spec

1. `01_args_locals_basics.zax`
   - typed function args
   - local scalar vars
   - return values

2. `02_fibonacci_args_locals.zax`
   - iterative fibonacci
   - args + locals + loop

3. `03_globals_and_aliases.zax`
   - global scalar initialization
   - global alias (`name = rhs`)
   - local alias usage

4. `10_arrays_and_indexing.zax`

- array declarations
- constant and register indexing

11. `11_records_and_fields.zax`

- record types
- field load/store
- local alias to global record

12. `12_args_with_arrays_records.zax`

- array args
- record-field access through array elements

13. `13_structured_control_flow.zax`

- `if`, `while`, `repeat`, `select`

14. `14_ops_and_calls.zax`

- `op` declarations
- matcher-based op usage
- function calls from instruction stream

## Notes

- These are learning/reference examples, not golden fixtures.
- Canonical verification fixtures remain under `test/fixtures/` and `test/fixtures/corpus/`.
