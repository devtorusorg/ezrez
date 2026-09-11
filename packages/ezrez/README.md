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
import * as utils from "ezrez/utils";  // define and normalizeCause
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
    return ez.fail({ tag: "INVALID_ID", message: "ID is required" });
  }
  return ez.ok({ id });
}

const result = loadUser("123");
if (ez.isError(result)) {
  result.failure.tag;  // "INVALID_ID", not string
  result.failure.cause; // null
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
{ isSuccess: true, value: S }
// or
{ isSuccess: false, failure: FailurePayload } // Resolved from E
```

`E` accepts string tags, complete failure objects, or a mix of both. Tags expand to failure
payloads with `{ tag; message; cause }`; complete objects must extend
`{ tag: string; message: string; cause: ErrorSnapshot | null }`.
Add your own fields, including `data`, and combine complete failure types in an error union.
Constructors preserve custom fields and failure-tag literals. They return only their own branch;
`ok` does not introduce a possible failure. Ordinary success payloads are not inferred deeply readonly.

`EzRez<S, never>` has only a success branch; `EzRez<never, E>` has only a failure branch;
`EzRez<never, never>` is `never`. `SuccessOf<R>` and `ErrorOf<R>` distribute across return branches,
and return `never` if their branch is absent. Native async functions also work: inspect their
results with `ErrorOf<Awaited<ReturnType<typeof yourAsyncFunction>>>`.

Readonly types describe the envelope; constructors do not freeze, deep-clone or validate payloads.
`fail` shallow-copies the failure input and defaults an omitted/undefined cause to `null`.
Use `as const` or explicit types for tags in previously declared variables if they have already
widened to `string`; constructors cannot recover lost literals.

### Shorthand error types

```ts
import { define, fail, ok, type EzFailOf, type EzRez } from "ezrez";

type DivideByZeroFailure = EzFailOf<"DIVIDE_BY_ZERO">;
// Readonly<{ tag: "DIVIDE_BY_ZERO"; message: string; cause: ErrorSnapshot | null }>

type MathFailure = EzFailOf<"DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER" | "SOMETHING_ELSE">;
// A union of separate failure payloads, not result envelopes.

function divide(a: number, b: number): EzRez<number, "DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER"> {
  if (b === 0) return fail({ tag: "DIVIDE_BY_ZERO", message: "Cannot divide by zero" });
  if (a > 100) return fail({ tag: "TOO_BIG_NUMBER", message: "Number exceeds 100" });
  return ok(a / b);
}

// Optional return-type normalization; native inference is also supported directly.
const easytype = define(divide);
type ResultByTags = EzRez<number, "DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER">;
type ResultByHelper = EzRez<number, EzFailOf<"DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER">>;
// ResultByTags and ResultByHelper are equivalent.

type OnlyZero = Extract<MathFailure, { tag: "DIVIDE_BY_ZERO" }>;
```

`EzFailOf` distributes over string unions, so extraction and narrowing work per tag.
`EzFailOf<never>` is `never`; the error parameter of `EzRez` still defaults to `never`.
`ErrorOf<R>` always extracts complete failure objects, **not** tag strings. The helper is
exported from both `ezrez` and `ezrez/core` and adds no runtime code.

For custom fields, mix a complete failure type with simple tags:

```ts
type TooBigFailure = EzFailOf<"TOO_BIG_NUMBER"> & { limit: number };
type Calculation = EzRez<number, "DIVIDE_BY_ZERO" | TooBigFailure>;
```

The `TOO_BIG_NUMBER` variant now requires `limit`; narrowing on `failure.tag` exposes it.
Tag-only annotations expose only the base fields, even if an implementation returns extra data.
Use native inference or complete failure types to retain those fields. Use each tag only once
in a mixed union: including both `"TOO_BIG_NUMBER"` and `TooBigFailure` would also allow the
base-only variant, defeating the required `limit` contract.

### Breaking change: `type` → `tag`

Use `fail({ tag: "ERROR", message: "..." })`, inspect `result.failure.tag`, and update stored or
transported failures to use `tag`. Legacy type-only constructor inputs and wire payloads are no
longer accepted; there is no automatic migration or alias. A valid failure may still carry an
unrelated custom `type` field alongside its required `tag`. Native Error custom fields are
preserved without renaming. Historical reference sources are unchanged.

### Guards

- `isSuccess(result)` and `isError(result)` narrow an already-typed result, preserving its branches.
- `isEzRez(unknown)` checks own data fields, the envelope, failure base fields, nested causes and
  JSON-safe `details`. Conflicting success/failure fields, malformed snapshots and cyclic details
  are rejected. It tolerates hostile reflection by returning false, not throwing.
- The boundary guard does **not** validate success contents, custom failure fields or application
  error tags, and does not accept a generic parameter claiming otherwise. Validate those with your
  application schema before treating a transported result as `EzRez<User, SpecificError>`.

## Optional function normalization

```ts
import { define, ok, fail } from "ezrez";

const load = define((id: string) => {
  if (!id) return fail({ tag: "INVALID_ID", message: "ID required" });
  return ok({ id });
});
// Public return type: EzRez<{ id: string }, InvalidIdFailure>
const count = define(() => ok(1)); // () => EzRez<number, never>
```

Native TypeScript typically displays `Ok<A> | Ok<B> | Fail<E>`. This is already a valid result.
`define` exposes a simplified `EzRez<A | B, E>` by extracting and combining the callback's return
branches. Base failures are reduced to their tag strings, while failures with custom fields retain
those fields. `Prettify` and `Simplified` are also available as type helpers. The simplification is
entirely optional. Editor tooltips may still expand aliases. Combining branches may lose
correlations between individual return branches, so prefer native inference when those matter.

At runtime `define(callback) === callback`: no per-call wrapper, catching, Promise handling or result
transformation. Optional/rest parameters are preserved. This helper targets ordinary synchronous,
non-generic functions. Generic, overloaded and explicit-`this` signatures should use native inference
or explicit annotations. Promise-returning and non-result callbacks are rejected by its types.

## Exception snapshots and custom error fields

```ts
import { fail, normalizeCause } from "ezrez";

class HttpError extends Error {
  status = 503;
  context = { retryable: true };
}

const result = fail({
  tag: "NETWORK",
  message: "Could not load user",
  cause: normalizeCause(new HttpError("Unavailable")),
});
// result.failure.cause:
// {
//   name: "Error", message: "Unavailable", stack: "...", cause: null,
//   details: { status: 503, context: { retryable: true } }
// }
```

`fail` accepts `ErrorSnapshot | Error | null` and always stores a fresh plain
`ErrorSnapshot | null`, so native Errors are normalized automatically. `normalizeCause(unknown)`
remains useful to explicitly snapshot an exception before constructing a failure, and creates data
compatible with both JSON and `structuredClone`:

```ts
type ErrorSnapshot = Readonly<{
  name: string;
  message: string;
  stack?: string;
  cause: ErrorSnapshot | null;
  details?: Readonly<Record<string, JsonValue>>;
}>;
```

- Null/undefined input becomes `null`. Primitive thrown values get a `NonError` name and string
  message; error-like objects use available string name/message/stack, with safe fallbacks.
- Own string-keyed custom data fields—including non-enumerable fields—are preserved in `details`.
  Standard name/message/stack/cause fields stay at the top level. A custom field called `details`
  on an Error becomes `snapshot.details.details`; existing valid plain snapshots are recognized
  without repeatedly nesting their details. A structurally identical plain error-like object is
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
  Cause/detail nesting is capped at 16. Truncated causes become terminal snapshots with name
  `NormalizationError` and message `circular` or `max-depth`; truncated details use markers.
- Custom-field accessors are not invoked; property reflection failures get markers. Standard
  name/message/stack/cause reads are guarded but may execute standard-field getters. No user
  `toJSON` method is called. Proxy traps may execute during inspection, but thrown failures are
  contained. This is not a sandbox for arbitrary objects.

This preserves data, **not** prototypes, reference identity, executable behavior or arbitrary
custom TypeScript types. Markers are not a reversible codec and can resemble user data. If you
need lossless handling of additional types, convert those fields to your own JSON representation
before normalization. **Stacks and custom fields may contain secrets: redact before transport.**

### Serialization contract

The result envelope and normalized error snapshots support both JSON and structured clone.
Success values and custom **failure** fields remain unrestricted: whole-result round trips only
work when those application payloads support the chosen serialization method.

```ts
const result = ok({ id: "123" });
JSON.parse(JSON.stringify(result));
structuredClone(result);
```

For example, JSON drops `ok(undefined).value`, cannot encode bigint or cycles, and does not preserve
Date/Map semantics. Structured clone rejects functions. The library does not silently rewrite your
success payloads or custom failure data. `normalizeCause` normalizes only exception snapshots.

## Incremental scope

This first implementation includes `ok`, `fail`, the three guards, result/extraction types,
`define`, and `normalizeCause`. Failure factories, recovery chains, exception-catching adapters,
async wrappers and other convenience utilities are deferred. The old implementation remains
reference material only; its names/signatures are not a compatibility contract.

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
