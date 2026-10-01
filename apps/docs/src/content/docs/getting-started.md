---
title: Getting started
description: Install ezrez and create your first typed result.
---

## Install

### npm

```sh
bun add ezrez
# or: npm install ezrez
```

### JSR

```sh
bunx jsr add @devtorus/ezrez
```

## Create a result

```ts
import { fail, isError, ok } from "ezrez";

function parsePort(input: string) {
  const port = Number(input);
  if (!Number.isInteger(port)) {
    return fail("INVALID_PORT", {
      message: `Invalid port: ${input}`,
      context: { input },
    });
  }
  return ok(port);
}

const result = parsePort("3000");

if (isError(result)) {
  result.tag; // "INVALID_PORT"
  result.cause.context.input; // string
} else {
  result.value; // number
}
```

No explicit return annotation is required. TypeScript infers the success value, literal failure tag,
and correlated error context.

## Match every branch

```ts
import { match } from "ezrez";

const message = match(parsePort("wrong"), {
  success: (port) => `Listening on ${port}`,
  errors: {
    INVALID_PORT: (failure) => failure.cause.message,
  },
});
```

Adding another failure to `parsePort` makes this match a compile-time error until its handler is
added.

## Entry points

```ts
import * as ez from "ezrez";          // Core and utilities
import * as core from "ezrez/core";   // Constructors, guards, and foundational types
import * as utils from "ezrez/utils"; // Matching, recovery, fallback, and normalization
```

Named imports are supported and recommended when convenient:

```ts
import { fail, match, ok, type EzRez } from "ezrez";
```

The npm package supports both ESM and CommonJS. JSR exposes the same root, `/core`, and `/utils`
entry points under `@devtorus/ezrez`.

## Next steps

- Learn the [result model and guards](/ezrez/results/).
- Handle branches with [matching and recovery](/ezrez/matching-and-recovery/).
- Understand [error snapshots and serialization](/ezrez/error-snapshots/).
