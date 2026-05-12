# Structured Loop Escape (`break`, `continue`)

*Status: direction under review*
*Issue: `GitHub issue #844`*

---

## 1. Why this exists

Course examples now show real pressure for ordinary structured loop escape.

The clearest case is `learning/part2/examples/unit9/eight_queens.zax`, where the current
language can express the search, but only by threading explicit state and early
returns through loops that would read more directly with `break` and likely
`continue`.

This is not a named-exit proposal. The course evidence does not justify jumping
straight to named exit. The pressure is for ordinary loop-local escape.

---

## 2. Direction

Introduce:

- `break` — exit the innermost enclosing loop
- `continue` — jump to the next iteration of the innermost enclosing loop

Target loops:

- `while`
- `repeat`
- `for` if/when `for` exists later; not part of this stream now

Non-goals:

- named exit / labeled break
- multi-level break
- function exit shorthand
- changes to `select`

---

## 3. Source semantics

### 3.1 `break`

`break` exits the nearest enclosing loop.

```zax
while NZ
  if C
    break
  end
  ; more loop body
end
```

### 3.2 `continue`

`continue` skips the remainder of the nearest enclosing loop body and starts the
next iteration.

```zax
while NZ
  if Z
    continue
  end
  ; work for non-zero case only
end
```

For `repeat … until`, `continue` jumps to the `until` condition check, not back
to the top of the body. This matches `do … while` convention. The programmer is
responsible for ensuring the flags reflect the intended `until` result before
`continue` executes, just as they are for the normal fall-through path.

### 3.3 Illegal positions

Both forms are invalid when not nested inside a loop body.

Examples that must diagnose:

```zax
func bad()
  break
end
```

```zax
if Z
  continue
end
```

---

## 4. Grammar and parser impact

This should be a narrow statement-level extension.

Add statement forms for:

- `break_stmt = "break"`
- `continue_stmt = "continue"`

Parser work must track loop nesting depth so out-of-loop uses diagnose cleanly.

This stream should not redesign control-flow parsing more broadly.

---

## 5. Lowering model

This is ordinary control-flow lowering.

For each loop body, lowering needs two targets:

- break target — the loop exit label
- continue target — the loop iteration restart label

Nested loops should behave naturally by pushing/popping loop-control context.

This should be implemented as structured lowering context, not ad hoc stringly
label lookups.

---

## 6. Diagnostics

Required diagnostics:

- `break` outside loop
- `continue` outside loop

Nice-to-have diagnostics later:

- unreachable code after unconditional `break` / `continue`

That is not required for the first implementation slice.

---

## 7. Why this before named exit

Named exit is a stronger feature with more grammar, nesting, and readability
cost. The course examples do not need that yet.

The evidence supports this order:

1. `break`
2. `continue`
3. only later revisit named/labeled exit if real examples still justify it

---

## 8. Implementation slices

1. parser / AST support for `break` and `continue`
2. lowering for innermost-loop escape
3. diagnostics and regression tests
4. spec / quick-guide updates after implementation
