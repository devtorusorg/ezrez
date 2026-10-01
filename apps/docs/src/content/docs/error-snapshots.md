---
title: Error snapshots
description: Normalize native errors into safe, transportable diagnostic data.
---

## Every failure has a snapshot

A tag-only failure receives a default snapshot:

```ts
import { fail } from "ezrez";

const result = fail("NOT_FOUND");

result.cause;
// {
//   name: "Error",
//   message: "NOT_FOUND",
//   cause: null
// }
```

Descriptors can override standard fields and add typed application context:

```ts
const result = fail("INVALID_PORT", {
  message: "The port is invalid",
  context: { input: "abc" },
});

result.cause.context.input; // string
```

## Native errors

Passing a native error makes its normalized snapshot the primary cause:

```ts
const error = Object.assign(new Error("connection refused"), { status: 503 });
const result = fail("SERVICE_UNAVAILABLE", error);

result.cause.message; // "connection refused"
result.cause.context.status; // number
```

The library creates a fresh plain object. Standard `name`, `message`, `stack`, and `cause` fields
remain snapshot fields; custom own properties are copied into `context`.

Use `normalizeCause(unknown)` when normalizing a caught exception without constructing a result:

```ts
import { normalizeCause } from "ezrez/utils";

try {
  await runTask();
} catch (error) {
  const snapshot = normalizeCause(error);
}
```

`null` and `undefined` normalize to `null`.

## Serialization

Failure envelopes and snapshots are designed for JSON and structured clone. Unsupported diagnostic
values become explicit `$ezrez` marker objects instead of making normalization fail.

```ts
const transported = structuredClone(result);
const json = JSON.parse(JSON.stringify(result));
```

Success payloads are intentionally unrestricted. The whole result is transportable only when its
success value supports the chosen serialization method.

## What normalization preserves

- JSON-safe primitives, arrays, and plain object data.
- Own string-keyed custom fields, including non-enumerable fields.
- Nested errors as nested snapshots.
- Dates as ISO strings.
- Repeated non-cyclic references as copied values.

Unsupported values—including functions, symbols, bigint, maps, sets, accessors, cycles, and values
past the depth limit—become informational markers. Normalization preserves data, not prototypes,
reference identity, methods, or arbitrary TypeScript classes.

:::caution
Stacks, messages, nested causes, and custom fields can contain secrets. Redact sensitive data before
storing or transporting a snapshot.
:::

## Boundary validation

`isEzRez` validates the exact result envelope and checks that error context is JSON-safe. It rejects
extra top-level fields, malformed snapshots, accessors, and cyclic context. It does not validate the
application-specific success payload or expected tag set.
