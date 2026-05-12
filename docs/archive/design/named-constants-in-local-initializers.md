# Named Constants in Local Initializers

*Status: direction under review*
*Issue: `GitHub issue #845`*

---

## 1. Why this exists

Course examples exposed an unnecessary readability failure in local `var`
initialization.

Examples such as:

```zax
var
  high_index: word = LastIndex
end
```

were not accepted, forcing imperative setup like:

```zax
var
  high_index: word = 0
end
ld hl, LastIndex
move high_index, hl
```

That is materially worse for algorithm code. This is not a niche edge case.

---

## 2. Direction

Allow local `var` initializers to use the same compile-time constant-expression
class that is already reasonable for declaration-time initialization.

At minimum, this stream should allow:

- named constants
- immediate literals
- simple compile-time immediate expressions already supported by const eval

Examples:

```zax
const LastIndex = 7

func binary_search(): HL
  var
    high_index: word = LastIndex
  end
end
```

```zax
var
  mask_value: byte = 1 << 3
end
```

Non-goals:

- runtime expressions in local initializers
- storage aliases disguised as initializers
- widening the initializer grammar to arbitrary EA expressions

---

## 3. Semantic rule

A local initializer is valid only if it can be fully evaluated at compile time.

So this should remain invalid:

```zax
var
  x: word = other_var
end
```

unless `other_var` is actually a compile-time constant in the language sense.

The key rule is:

- local declaration-time initialization remains constant-only
- but constant means actual compile-time expressions, not just literals

---

## 4. Parsing concern

The course report suggests local named-constant initializers are currently being
misread through alias-style initialization machinery.

This stream should fix that boundary explicitly.

The parser should distinguish:

- constant initializer expression
- alias/storage-style declaration forms

and stop rejecting constant-name initializers by routing them down the wrong
path.

---

## 5. Lowering model

Nothing exotic is needed.

If the initializer is compile-time constant:

- evaluate it at compile time
- lower it the same way other constant local initialization is lowered

This is not a runtime-expression feature.

---

## 6. Diagnostics

Required diagnostics:

- non-constant local initializer expression
- unknown constant name
- type-size mismatch if the constant cannot fit

The diagnostics should make clear that the failure is about const-ness, not a
mysterious alias parse.

Ownership notes:

- unknown constant name is a semantic lookup failure, not a parser failure
- type-size mismatch is a semantic evaluation/type-fit failure, not a parser
  concern

---

## 7. Implementation slices

1. parser fix so constant-name initializers are not misrouted into alias-style
   declaration handling
2. semantic support for constant-name local initializers
3. broaden to simple compile-time expressions if not already covered
4. diagnostics and regression tests, including unknown-name and type-width
   checks
5. spec / quick-guide updates after implementation
