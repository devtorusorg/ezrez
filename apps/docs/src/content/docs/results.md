---
title: Results and guards
description: The EzRez result model, constructors, types, and narrowing guards.
---

## Result shape

`EzRez<S, E>` is a plain discriminated union:

```ts
{ tag: "success", value: S }
// or
{ tag: FailureTag, cause: ErrorSnapshot }
```

The failure parameter defaults to `never`, so `EzRez<number>` is success-only. It accepts literal
tag strings, complete `Fail` branches, or unions of both.

```ts
import type { EzFailOf, EzRez } from "@devtorusorg/ezrez";

type ParseResult = EzRez<number, "EMPTY" | "INVALID_NUMBER">;
type ParseFailures = EzFailOf<"EMPTY" | "INVALID_NUMBER">;
```

`"success"` is reserved and cannot be used as a failure tag.

## Constructors

Use `ok` for a success and `fail` for a failure:

```ts
import { fail, ok } from "@devtorusorg/ezrez";

const success = ok({ id: "user-1" });
const missing = fail("NOT_FOUND");
const invalid = fail("INVALID_INPUT", {
  message: "Email is required",
  context: { field: "email" },
});
```

Failure envelopes contain exactly `tag` and `cause`. Put application diagnostics in the snapshot's
`context`, not at the top level.

## Narrowing guards

```ts
import { isError, isSuccess } from "@devtorusorg/ezrez";

if (isSuccess(result)) {
  result.value;
}

if (isError(result)) {
  result.tag;
  result.cause;
}
```

Both guards preserve the exact branches inferred for the input.

`isEzRez(unknown)` is a structural boundary check for transported data. It validates the envelope
and normalized error snapshot, but it does not validate your success payload or domain failure tags.
Use an application schema before treating external data as a specific `EzRez<User, UserFailure>`.

## Extracting branch types

```ts
import type { ErrorOf, SuccessOf } from "@devtorusorg/ezrez";

type Result = ReturnType<typeof parsePort>;
type Port = SuccessOf<Result>;
type ParseError = ErrorOf<Result>;
```

For async functions, unwrap the promise first:

```ts
type AsyncError = ErrorOf<Awaited<ReturnType<typeof loadUser>>>;
```

## Explicit public contracts

Native inference is usually the most concise option. Use an annotation when an exported function
must commit to a fixed contract:

```ts
import { fail, ok, type EzRez } from "@devtorusorg/ezrez";

function findUser(id: string): EzRez<{ id: string }, "NOT_FOUND"> {
  return id === "user-1" ? ok({ id }) : fail("NOT_FOUND");
}
```
