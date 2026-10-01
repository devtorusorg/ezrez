# ezrez

Small, data-only TypeScript results for browser and Node.js projects. Native return inference,
literal error tags, optional helpers, and tree-shakeable ESM exports. No runtime dependencies.

## Install

### npm

```sh
bun add ezrez
```

```ts
import * as ezrez from "ezrez";
```

CommonJS consumers are also supported:

```js
const ezrez = require("ezrez");
```

### JSR

```sh
bunx jsr add @devtorus/ezrez
```

```ts
import * as ezrez from "@devtorus/ezrez";
```

## Entry points

```ts
import * as ez from "ezrez";           // Core + utilities
import * as core from "ezrez/core";    // Constructors, guards and types only
import * as utils from "ezrez/utils";  // Matching, recovery, fallback and normalization
// Named imports work too:
import { ok, fail, type EzRez } from "ezrez/core";
```

JSR has the same `/core` and `/utils` subpaths under `@devtorus/ezrez`.
These are named module exports, not a constructed API object. Modern ESM bundlers can eliminate
unused functions even with static namespace access (`ez.ok(...)`). Dynamic namespace access or
passing the entire namespace around may retain more code. CommonJS tree shaking is not guaranteed.
Core never imports utilities; importing `ok` does not pull in cause normalization or validation.

## Native inference first

```ts
import * as ez from "ezrez";
import type { EzRez, ErrorOf, SuccessOf } from "ezrez";

function loadUser(id: string) {
  if (!id) {
    return ez.fail("INVALID_ID");
  }
  return ez.ok({ id });
}

const result = loadUser("123");
if (ez.isError(result)) {
  result.tag;   // "INVALID_ID", not string
  result.cause; // ErrorSnapshot
} else {
  result.value.id;      // string
}

type LoadError = ErrorOf<ReturnType<typeof loadUser>>;
type User = SuccessOf<ReturnType<typeof loadUser>>;
const explicit: (id: string) => EzRez<User, LoadError> = loadUser;

function count(): EzRez<number> { // Error parameter defaults to never
  return ez.ok(1);
}
```

`EzRez<S, E>` is a plain discriminated union:

```ts
{ tag: "success", value: S }
// or
{ tag: FailureTag, cause: ErrorSnapshot }
```

`"success"` is reserved for the success branch. Every failure tag lives at the result boundary.
Every failure has a non-null normalized snapshot. With only a tag, `fail` creates
`{ name: "Error", message: tag, cause: null }`; there is no failure-specific message outside that
snapshot.

`Failure` describes the base `{ cause }` field. `E` accepts string tags, complete `Fail<Tag>`
branches, or a mix of both. String tags expand to failure branches automatically. Failure
envelopes contain exactly `tag` and `cause`; diagnostic metadata belongs to the normalized error's
`context`. Constructors preserve failure-tag literals and return only their own branch; `ok` does
not introduce a possible failure. Ordinary success payloads are not inferred deeply readonly.

`EzRez<S, never>` has only a success branch; `EzRez<never, E>` has only a failure branch;
`EzRez<never, never>` is `never`. `SuccessOf<R>` and `ErrorOf<R>` distribute across return branches,
and return `never` if their branch is absent. Native async functions also work: inspect their
results with `ErrorOf<Awaited<ReturnType<typeof yourAsyncFunction>>>`.

Readonly types describe the envelope; constructors do not freeze, deep-clone or validate success
payloads. `fail(tag)`, `fail(tag, descriptor)`, and `fail({ tag, ...descriptor })` merge descriptor
fields into the default snapshot. `fail(tag, nativeError)` instead uses the normalized native Error
as the primary snapshot. A dynamically supplied `"success"` failure tag throws because it would
collide with the success branch.
Use `as const` or explicit types for tags in previously declared variables if they have already
widened to `string`; constructors cannot recover lost literals.

### Shorthand error types

```ts
import { fail, ok, type EzFailOf, type EzRez } from "ezrez";

type DivideByZeroFailure = EzFailOf<"DIVIDE_BY_ZERO">;
// Readonly<{
//   tag: "DIVIDE_BY_ZERO";
//   cause: ErrorSnapshot;
//   value?: never;
// }>

type MathFailure = EzFailOf<"DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER" | "SOMETHING_ELSE">;
// A union of separate failure result branches.

function divide(a: number, b: number): EzRez<number, "DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER"> {
  if (b === 0) return fail("DIVIDE_BY_ZERO");
  if (a > 100) return fail("TOO_BIG_NUMBER");
  return ok(a / b);
}

type ResultByTags = EzRez<number, "DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER">;
type ResultByExplicitFailures = EzRez<number, EzFailOf<"DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER">>;
// ResultByTags and ResultByExplicitFailures are equivalent.

type OnlyZero = Extract<MathFailure, { tag: "DIVIDE_BY_ZERO" }>;
```

`EzFailOf` distributes over string unions, so extraction and narrowing work per tag.
`EzFailOf<never>` is `never`; the error parameter of `EzRez` still defaults to `never`.
`ErrorOf<R>` extracts complete failure result branches, **not** bare tags or nested details.
`EzFailOf` is exported from both `ezrez` and `ezrez/core` and adds no runtime code.

Failure envelopes intentionally accept no application data and always contain an `ErrorSnapshot`.
Expected domain failures receive the default snapshot automatically. Data referenced by a native
Error is preserved under `cause.context`.

### Tagged result envelope

Use `fail("ERROR")`, `fail("ERROR", descriptor)`, or `fail("ERROR", error)`, then inspect
`result.tag` or `result.cause`. The equivalent inline descriptor form is
`fail({ tag: "ERROR", ...descriptor })`. Stored or transported results using
`{ isSuccess, value | failure }`, nested failure details, nullable top-level causes, or custom
top-level failure fields must migrate to the exact `{ tag, cause: ErrorSnapshot }` shape. There is
no automatic migration or alias. Native Error custom fields are preserved inside the normalized
snapshot's `context`. Historical reference sources are unchanged.

### Guards

- `isSuccess(result)` and `isError(result)` narrow an already-typed result by its outer tag while
  preserving exact branches.
- `isEzRez(unknown)` checks exact own envelope fields, the normalized cause, and JSON-safe snapshot
  `context`. Conflicting fields, obsolete failure containers, extra envelope fields, malformed
  snapshots, and cyclic context are rejected. Hostile reflection returns false rather than throwing.
- The boundary guard does **not** validate success contents or application error tags, and does not
  accept a generic parameter claiming otherwise. Validate those with your application schema before
  treating a transported result as `EzRez<User, SpecificError>`.

## Exhaustive matching

Use `match` to consume a result and require every possible branch at compile time:

```ts
const message = ez.match(loadUser("123"), {
  success: (user) => `Loaded ${user.id}`,
  errors: {
    INVALID_ID: (failure) => failure.cause.message,
  },
});
```

Each keyed callback receives its correlated failure branch, and the return type is the union of all
callback outputs. Exhaustive matching requires a finite literal failure-tag union; a widened
`Fail<string>` cannot be proven exhaustive.

For a reusable matcher, supply the result type explicitly:

```ts
type LoadResult = ReturnType<typeof loadUser>;

const describeLoad = ez.match<LoadResult>()({
  success: (user) => `Loaded ${user.id}`,
  errors: {
    INVALID_ID: () => "Invalid ID",
  },
});
```

`matchAsync` accepts a result or promised result, permits sync or async callbacks, and always returns
a `Promise`.

## Recovery and fallback

Recovery callbacks return another result. The first matching catcher runs, successes pass through,
and unmatched failures remain in the output type:

```ts
const recovered = ez.recover(
  loadUser(""),
  ez.catchTag("INVALID_ID", () => ez.ok({ id: "guest" })),
);
```

Use `catchTags` for a subset, `catchAllTags<R>()` for an exhaustive keyed recovery, and `catchAll`
for an explicit fallback:

```ts
type LoadResult = ReturnType<typeof loadUser>;

const recoverLoad = ez.recover(
  ez.catchAllTags<LoadResult>()({
    INVALID_ID: () => ez.ok({ id: "guest" }),
  }),
);

const user = ez.getOr(recoverLoad(loadUser("")), { id: "guest" });
```

`getOr` requires a fallback assignable to the result's success type. `recover` accepts only
synchronous handlers; use `recoverAsync` for sync or async handlers and promised inputs. Catcher
descriptors are plain `{ handlers, fallback? }` data objects and can be reused.

## Exception snapshots and custom error fields

```ts
import { fail } from "ezrez";

class HttpError extends Error {
  status = 503;
  context = { retryable: true };
}

const result = fail("NETWORK", new HttpError("Unavailable"));
// result.cause:
// {
//   name: "Error", message: "Unavailable", stack: "...", cause: null,
//   context: { status: 503, context: { retryable: true } }
// }
```

`fail(tag, nativeError)` always stores a fresh plain `ErrorSnapshot`, so native Errors are normalized
automatically. Descriptor calls merge defined `name`, `message`, `stack`, `cause`, and `context`
fields into `{ name: "Error", message: tag, cause: null }`; `undefined` does not erase defaults.
When a descriptor supplies `context`, its type remains coupled to the returned failure tag:

```ts
const parsedPort = fail("INVALID_PORT", { context: { input: "3000" } });
if (parsedPort.tag === "INVALID_PORT") {
  parsedPort.cause.context.input; // string
}
```

Correlated failure branches are preserved. If multiple shapes share one tag, the tag
cannot distinguish them; give the inner context its own discriminant. In descriptor forms, `cause`
is the snapshot's nested cause. Use the two-argument native Error form when the Error itself should
be the primary snapshot. `normalizeCause(unknown)` remains useful to explicitly snapshot an exception
and creates data compatible with both JSON and `structuredClone`:

```ts
type ErrorDescriptor = Readonly<{
  name?: string;
  message?: string;
  stack?: string;
  cause?: unknown;
  context?: Readonly<Record<string, JsonValue>>;
}>;

type ErrorSnapshot = Readonly<{
  name: string;
  message: string;
  stack?: string;
  cause: ErrorSnapshot | null;
  context?: Readonly<Record<string, JsonValue>>;
}>;

type ErrorSnapshotWithContext<C extends Readonly<Record<string, JsonValue>>> =
  Omit<ErrorSnapshot, "context"> & { context: C };
```

- Null/undefined input becomes `null`. Primitive thrown values get a `NonError` name and string
  message; error-like objects use available string name/message/stack, with safe fallbacks.
- Own string-keyed custom data fields—including non-enumerable fields—are preserved in `context`.
  Standard name/message/stack/cause fields stay at the top level. A custom field called `context`
  on an Error becomes `snapshot.context.context`; existing valid plain snapshots are recognized
  without repeatedly nesting their context. A structurally identical plain error-like object is
  likewise treated as an existing snapshot.
- JSON-safe primitives, nested object data and array elements are preserved. Negative zero becomes
  zero. Nested Errors become snapshots, Dates become ISO strings, and AggregateError's own `errors`
  field is normalized recursively. Array holes become undefined markers; extra array properties
  are not preserved. Symbols, private fields and inherited class methods are not copied.
- Unsupported values become informational objects `{ $ezrez: reason }`. Reasons include
  `undefined`, `function`, `symbol`, `bigint`, `non-finite-number`, `invalid-date`,
  `unsupported-object`, `accessor`, `unreadable`, `circular` and `max-depth`.
  Map/Set/typed arrays and custom `Symbol.toStringTag` objects are not expanded.
- Cycles are detected on the current traversal path; repeated non-cyclic references are copied.
  Cause/context nesting is capped at 16. Truncated causes become terminal snapshots with name
  `NormalizationError` and message `circular` or `max-depth`; truncated context uses markers.
- Custom-field accessors are not invoked; property reflection failures get markers. Standard
  name/message/stack/cause reads are guarded but may execute standard-field getters. No user
  `toJSON` method is called. Proxy traps may execute during inspection, but thrown failures are
  contained. This is not a sandbox for arbitrary objects.

This preserves data, **not** prototypes, reference identity, executable behavior or arbitrary
custom TypeScript types. Markers are not a reversible codec and can resemble user data. If you
need lossless handling of additional types, convert those fields to your own JSON representation
before normalization. **Stacks and custom fields may contain secrets: redact before transport.**

### Serialization contract

The exact failure envelope and normalized error snapshots support both JSON and structured clone.
Success values remain unrestricted, so whole-result round trips require the success payload to
support the chosen serialization method.

```ts
const result = ok({ id: "123" });
JSON.parse(JSON.stringify(result));
structuredClone(result);
```

For example, JSON drops `ok(undefined).value`, cannot encode bigint or cycles, and does not preserve
Date/Map semantics. Structured clone rejects functions. The library does not silently rewrite
success payloads; `normalizeCause` normalizes exception snapshots.

## Current scope

The public API includes constructors, narrowing guards, result/extraction types, cause
normalization, exhaustive matching, composable recovery, and value fallback. Exception-catching
adapters and failure factories are not part of the current API. The old implementation remains
reference material only; its names and signatures are not a compatibility contract.

## Development

Requires Bun for development; Node.js 18 or newer is supported for consumers. Types are tested
with TypeScript 5.9; no TypeScript 7-specific features or runtime dependencies are needed.

```sh
bun install
bun run check
bun run build
bun run test:consumers
bun run test:tree-shaking
bun run pack:check
bun run jsr:check
```

The npm package is built into `dist/` as ESM, CommonJS, and TypeScript declarations.
JSR publishes production TypeScript modules through the three source entry points; tests and the
old reference are excluded. Keep library source free of Node-only or browser-only APIs, and use
explicit `.js` relative specifiers (verified by the JSR dry run).

`check` runs formatting, linting, `tsc` (including compile-time test assertions), and Vitest.
Consumer checks pack the package and exercise all three ESM/CJS entry points and declarations.
Tree-shaking checks use Bun's browser ESM bundler, with named and static namespace imports and a
512-byte `ok`-only regression ceiling; Bun is already the project's package manager.

### IDE error playground

[`playground.ts`](playground.ts) intentionally contains invalid API uses without `@ts-expect-error`.
It is excluded from the normal TypeScript build/typecheck and Biome lint scopes, so `bun run check`
remains green. Open that file directly in an IDE to see the actual diagnostics. Do not add it back
to `tsconfig.json` unless you want those intentional errors to fail CI.

## Releases

Release Please creates a release PR from conventional commits and synchronizes `package.json` and
`deno.json` versions. Merging that PR creates a GitHub release; the publish workflow then releases
the tagged revision to npm and JSR.

Before the first release:

1. Create/link the `@devtorus/ezrez` package to this GitHub repository in JSR so its GitHub OIDC
   trusted publishing can succeed.
2. Create an npm automation token for `ezrez` and save it as the repository `NPM_TOKEN` secret.
3. Ensure GitHub Actions has permission to create pull requests and write contents. The publish
   workflow already requests `id-token: write` for JSR.
4. Use Conventional Commit messages (`feat:`, `fix:`, `feat!:`, etc.) so Release Please can select
   the appropriate version.

The initial Release Please manifest is version `0.1.0`. Adjust it before enabling releases if the
first published version should differ.

## License

[MIT](LICENSE)
