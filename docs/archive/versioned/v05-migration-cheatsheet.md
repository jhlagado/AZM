# v0.5 Syntax Cheatsheet

## Core Layout Pattern

Use named section blocks as the structural unit:

```zax
section code app at $0100
  export func main()
  end
end

section data state at $8000
  counter: byte
  frame_count: word = 0
end
```

## Data Declaration Rules

- Data declarations belong inside `section data <name> ... end`.
- Direct declarations are the canonical form:
  - `name: Type`
  - `name: Type = initializer`
  - `name = rhs` (alias initializer)
- Omitted initializer means zero-initialized storage.

## Anchors and Contributions

- A named section with declarations contributes to key `(kind, name)`.
- Every contributed key must have exactly one anchor (`at ...`) in the program.
- Duplicate anchors for the same key are errors.
- Anchors with no contributions emit warnings.

## Recommended Naming

- Use stable section names (`app`, `boot`, `state`, `assets`, `lookup`).
- Keep section keys consistent across modules so merge order remains deterministic.

## PR Checklist

- Files use named sections for module layout.
- Data declarations appear only in named `data` sections.
- Every contributed section key is anchored exactly once.
- Examples compile under current parser and lowering rules.
