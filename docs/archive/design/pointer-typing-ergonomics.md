# Pointer-Typing Ergonomics

Status: proposed review record for `GitHub issue #852`

## Problem

Unit 7 course examples (`linked_list.zax`, `bst.zax`) made pointer-heavy code look
more verbose than ordinary record/array code.

The obvious question is whether ZAX now needs a new pointer feature such as:
- `ptr<T>`
- self-referential record declarations
- a new dereference operator
- broader typed-pointer inference

Before adding any of that, the first job is to separate real language gaps from
example style that failed to use the current language surface well.

## What the current language already supports

Current `main` already accepts direct typed reinterpretation through `addr` or
`word` scalar names:

```zax
move a, <ListNode>current_ptr.value
move hl, <TreeNode>node_ptr.right
move <ListNode>current_ptr.next, hl
```

That means the most repetitive Unit 7 pattern:

```zax
move hl, current_ptr
move a, <ListNode>hl.value
```

is usually not required. The pointer scalar can already be used directly as the
reinterpretation base.

So the strongest apparent friction from Unit 7 is partly an example-authoring
issue, not immediately a compiler or language deficiency.

## Actual remaining friction

Even with the direct form above, some real friction remains.

### 1. `addr` fields are untyped

A record field such as:

```zax
type ListNode
  next: addr
end
```

carries no pointee type. The next access site must reintroduce that type with a
reinterpretation head.

This is explicit and workable, but verbose.

### 2. Self-reference is not modeled in declarations

A linked structure can be expressed today using `addr` fields, but the type
system does not express that `next` points to `ListNode` or that `left` and
`right` point to `TreeNode`.

That is a type-precision limitation, not a basic expressibility blocker.

### 3. Null-sentinel and allocation conventions are still manual

The course examples still need:
- `0` as a null sentinel
- explicit pool/allocation discipline
- explicit traversal conventions

Those are mostly library/convention issues, not parser or core-language gaps.

## Rejected immediate directions

### Do not add a new dereference operator now

A new operator would widen the language surface before the current
reinterpretation form is even being used consistently.

### Do not add `ptr<T>` yet

`ptr<T>` is tempting, but the course evidence is not yet strong enough to justify
new pointer-type syntax. The examples prove verbosity, not that the current
surface is failing semantically.

### Do not treat self-referential records as the next mandatory stream

They would improve type precision, but they are not required to express the Unit
7 algorithms. The course examples already compile and run on current `main`.

## Recommended action

### Recommendation: no compiler work yet

`GitHub issue #852` should not immediately turn into an implementation stream.

The right next step is a small docs/examples cleanup pass:
- update Unit 7 examples to use direct forms like `<ListNode>current_ptr.value`
  where possible
- add one explicit quick-guide/reference example showing reinterpretation from an
  `addr` local/argument, not just from `HL`
- document that this is the preferred current pointer-traversal idiom

This is likely enough to remove a large part of the apparent friction without
adding a new language feature.

## What to watch after that cleanup

If pointer-heavy examples still feel materially worse after they use the direct
form consistently, then reopen the design discussion in this order:

1. self-referential record declarations
2. typed pointer surface such as `ptr<T>`
3. broader pointer convenience syntax

That order keeps the language conservative and evidence-driven.

## Decision

Current recommendation for `GitHub issue #852`:
- do a docs/example cleanup first
- do not start compiler implementation work yet
- keep typed-pointer syntax and self-referential records on the watchlist, not
  in the active stream
