# Software-Stack Helper Library

Status: proposed review record for course follow-up

## Problem

`learning/part2/examples/unit7/rpn_calculator.zax` shows a real ergonomic issue in current
ZAX: software-stack code is expressible, but push/pop style movement is noisy
because values must shuttle through registers and the stack protocol is repeated
inline.

Current helper shape in the example:

```zax
func push_value(value_word: word)
  move a, stack_depth
  ld l, a
  move hl, value_word
  move value_stack[L], hl

  move a, stack_depth
  inc a
  move stack_depth, a
end

func pop_value(): HL
  move a, stack_depth
  dec a
  move stack_depth, a

  ld l, a
  move hl, value_stack[L]
end
```

This is not a missing language feature. It is a repeated helper pattern.

## Decision

Treat software-stack support as a library/support stream, not a language stream.

Do not pursue:
- a first-class `stack` construct
- runtime range checking in this stream
- pointer/bounds redesign in this stream
- broader `move` redesign in this stream

## Minimal model

A software stack is just:
- a backing array
- a depth/index cell
- a fixed growth convention

That is enough for the current course use-cases.

## Recommended first helper slice

Start with word-oriented helpers only.

### Include

- `push_word`
- `pop_word`
- optionally `peek_word` only if the first implementation pass proves it useful

### Exclude

- byte variants in the first slice
- bounds checking
- dynamic allocation
- generic stack metadata objects
- shared polymorphic helper machinery

## Helper contract

The first slice should standardize the convention, not hide it behind a large
abstraction.

Recommended contract:
- backing store is a fixed `word[n]`
- depth is a `byte` slot holding the current element count
- `push_word` stores at current depth, then increments depth
- `pop_word` decrements depth, then loads the removed element into `HL`

This matches the Unit 6 example exactly.

## Why library-first is the right choice

1. The course proved verbosity, not missing expressibility.
2. The pattern is already implementable as helpers today.
3. A helper layer lets us test whether the ergonomics problem is mostly solved
   without widening the language.
4. If the helper layer still feels inadequate later, we will have a concrete
   baseline to compare against.

## Success criterion

Rewrite the Unit 6 example to use the helper layer and judge whether the RPN
algorithm reads materially better.

If it does, stop there.
If it does not, reopen the discussion around a narrow language improvement.

## Next step

Open a library/support implementation issue for a minimal word-stack helper
module or canonical helper example, then update `rpn_calculator.zax` to use it.
