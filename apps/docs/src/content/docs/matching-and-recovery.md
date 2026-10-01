---
title: Matching and recovery
description: Exhaustive matching, composable recovery, asynchronous handlers, and value fallbacks.
---

## Exhaustive terminal matching

Use `match` when every branch should become a plain value:

```ts
import { match } from "ezrez";

const message = match(result, {
  success: (user) => `Loaded ${user.name}`,
  errors: {
    NOT_FOUND: (failure) => failure.cause.message,
    UNAUTHORIZED: () => "Sign in",
    OFFLINE: () => "Retry later",
  },
});
```

The error map must contain every possible failure tag and no unknown tags. Each handler receives the
exact failure branch correlated with its key. The output is the union of all handler return types.

Exhaustive matching requires a finite literal tag union. A result typed as `Fail<string>` cannot be
proven exhaustive; narrow that boundary value or use recovery with `catchAll`.

### Reusable matchers

Supply the result type explicitly when defining a matcher for reuse:

```ts
type LoadResult = ReturnType<typeof loadUser>;

const describeLoad = match<LoadResult>()({
  success: (user) => `Loaded ${user.name}`,
  errors: {
    NOT_FOUND: () => "Missing",
    UNAUTHORIZED: () => "Sign in",
    OFFLINE: () => "Offline",
  },
});

const message = describeLoad(loadUser("user-1"));
```

## Recovering into another result

Recovery handlers return another ezrez result. Handled input failures are removed from the output
type; failures returned by handlers are added.

```ts
import { catchTag, ok, recover } from "ezrez";

const recovered = recover(
  result,
  catchTag("OFFLINE", () => ok(cachedUser)),
);
```

Recovery applies the first matching catcher. Success values pass through unchanged, and an
unmatched failure remains unchanged.

### Several tags

Use `catchTags` for a subset or `catchAllTags` when every known tag must be handled:

```ts
import { catchAllTags, recover } from "ezrez";

type LoadResult = ReturnType<typeof loadUser>;

const recoverLoad = recover(
  catchAllTags<LoadResult>()({
    NOT_FOUND: () => ok(guestUser),
    UNAUTHORIZED: () => ok(guestUser),
    OFFLINE: () => ok(cachedUser),
  }),
);

const recovered = recoverLoad(loadUser("user-1"));
```

The explicit `LoadResult` gives each keyed callback its correlated failure type and lets
`catchAllTags` check missing and extra keys.

Use `catchAll` as a final fallback:

```ts
const recovered = recover(
  result,
  catchTag("OFFLINE", () => ok(cachedUser)),
  catchAll((failure) => fail("LOAD_FAILED", { cause: failure.cause })),
);
```

## Async matching and recovery

`match` and `recover` are synchronous. Promise-returning callbacks belong in `matchAsync` and
`recoverAsync`; both async runners always return a `Promise`.

```ts
const message = await matchAsync(Promise.resolve(result), {
  success: async (user) => formatUser(user),
  errors: {
    NOT_FOUND: async () => "Missing",
    UNAUTHORIZED: () => "Sign in",
    OFFLINE: () => "Offline",
  },
});

const recovered = await recoverAsync(
  result,
  catchTag("OFFLINE", async () => ok(await readCachedUser())),
);
```

The same catcher descriptors work with `recoverAsync`; there are no separate async catcher
constructors.

## Simple fallback values

Use `getOr` when only a success value or same-type fallback is needed:

```ts
import { getOr } from "ezrez";

const port = getOr(parsePort(input), 3000);
```

The result controls the type. The fallback cannot silently widen the success value type, and a
failure-only result is rejected because it has no success type.
