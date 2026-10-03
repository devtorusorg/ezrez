---
title: ezrez
description: Small, data-only TypeScript results with exhaustive failure handling.
template: splash
hero:
  tagline: Typed results, literal failure tags, exhaustive matching, and no runtime dependencies.
  actions:
    - text: Get started
      link: /ezrez/getting-started/
      icon: right-arrow
      variant: primary
    - text: Matching and recovery
      link: /ezrez/matching-and-recovery/
      icon: open-book
---

## Results that stay simple

An ezrez result is a plain discriminated union. Successes contain a value; failures contain a
literal tag and a serializable error snapshot.

```ts
import { fail, match, ok } from "@devtorusorg/ezrez";

function divide(a: number, b: number) {
  if (b === 0) return fail("DIVIDE_BY_ZERO");
  return ok(a / b);
}

const message = match(divide(10, 0), {
  success: (value) => `Result: ${value}`,
  errors: {
    DIVIDE_BY_ZERO: (failure) => failure.cause.message,
  },
});
```

- Native TypeScript return inference preserves literal failure tags.
- `match` checks every possible result branch at compile time.
- Recovery helpers preserve unhandled failures in the output type.
- Native errors become JSON- and structured-clone-safe snapshots.
- Core constructors and utilities are independently tree-shakeable.

## Packages

- npm: [`@devtorusorg/ezrez`](https://www.npmjs.com/package/@devtorusorg/ezrez)
- JSR: [`@devtorusorg/ezrez`](https://jsr.io/@devtorusorg/ezrez)
- Source: [`devtorusorg/ezrez`](https://github.com/devtorusorg/ezrez)
