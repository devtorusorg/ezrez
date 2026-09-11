# EzRez core and utilities redesign

## Context

Implement a new public library using `packages/ezrez/src/old_reference_implementation/ezRez/` as a behavioral reference. The current public `src/index.ts` is empty. The reference uses plain `{ isSuccess, value | failure }` results, literal failure tags and optional data, but lacks standardized causes and defaults its error parameter to a broad error rather than `never`.

The package already has `sideEffects: false`, ESM/CJS declaration-aware exports, tsup, Vitest, TypeScript 5.9, and npm/JSR publication infrastructure.

## Approach

- Separate minimal core and optional utilities; expose named exports supporting `import * as ezrez from 'ezrez'` without constructing a runtime API object.
- Use data-only discriminated unions, with `EzRez<SuccessUnion, ErrorUnion>` and no-error default `never`.
- Preserve literal error tags and branch inference. Distinguish semantic inferred union equivalence from TypeScript's choice of displayed type alias; compiler upgrades cannot promise alias display.
- Keep the existing TypeScript 5.9 baseline unless a demonstrated type-system limitation requires an upgrade; TS 7 is permitted, not required. Prototype inference before runtime implementation.

## Confirmed direction

- Prefer compatibility with both JSON and structured clone: use a plain error snapshot, not a native Error instance. Success values remain unrestricted, so whole-result serializability is conditional on the payload; do not claim universal round-trip guarantees.
- Freely redesign names/signatures and implement incrementally; reference code captures intent, not a compatibility obligation.
- Proposed exports: `ezrez/core` for minimal primitives, `ezrez/utils` for helpers, and `ezrez` as a named-export barrel of both. No runtime namespace object; verify static namespace member access tree-shakes.
- Native inference is first-class; include optional synchronous `define` in utils to normalize a callback's public return signature. No wrapper is required for constructors, narrowing or extraction.
- Always include `cause` on produced failures; use `null` when absent.
- Initial increment: constructors, guards, type extraction, cause normalization and `define`. Defer factories, recovery chains, exception-catching adapters, async wrappers and other helpers.

### Core API and types

Preserve the useful reference wire shape, without preserving old function names:

```ts
type JsonValue = string | number | boolean | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
type ErrorSnapshot = Readonly<{
  name: string;
  message: string;
  stack?: string;
  cause: ErrorSnapshot | null;
  details?: Readonly<Record<string, JsonValue>>;
}>;
type Failure = Readonly<{
  type: string;
  message: string;
  cause: ErrorSnapshot | null;
}>;
type Ok<S> = Readonly<{ isSuccess: true; value: S }>;
type Fail<E extends Failure> = Readonly<{ isSuccess: false; failure: E }>;
type EzRez<S, E extends Failure = never> =
  | ([S] extends [never] ? never : Ok<S>)
  | ([E] extends [never] ? never : Fail<E>);
```

- `ok(value)` returns only `Ok<S>`, never a broad result that introduces phantom failures.
- `fail({ type, message, cause?, ...extraFields })` returns only `Fail<E>`, preserves literal tags and custom fields, and fills missing/undefined cause with `null`. Its cause input is an already-normalized `ErrorSnapshot | null`, not a native Error. Use const inference where appropriate for failures; do not unexpectedly make ordinary success payloads deeply readonly.
- Custom failure types structurally extend `Failure`; avoid reconstructing them through conditional `data` inference as the reference does. Custom fields, like success values, must themselves be serializable for whole-result round trips.
- `isSuccess(result)` and `isError(result)` narrow existing typed results while preserving the exact input branches. Use `Extract`-style predicates and test union inputs.
- `isEzRez(unknown)` validates the envelope and base failure/snapshot structure, rejects conflicting branch fields, and returns a broad validated result type. It must not pretend to validate arbitrary caller-selected payload/error generics. Success payload contents remain unchecked.
- Export `SuccessOf<R>`, `ErrorOf<R>` and `Normalize<R>` using distributive branch extraction. Success-only errors and failure-only successes resolve to `never`; `EzRez<never, never>` is `never`.
- No classes, symbols, prototype methods, executable fields, freezing or module initialization side effects. Readonly is a TypeScript contract, not deep runtime immutability.

### Utilities

- `normalizeCause(unknown): ErrorSnapshot | null` produces fresh JSON-safe plain data. Null/undefined become null; Errors and error-like objects contribute name/message/stack and recursively normalized causes. Primitive thrown values get a deterministic name/message; unrecognized objects get a stable fallback message plus safely normalized own fields, never arbitrary `JSON.stringify` or user `toJSON` execution.
- Preserve custom error fields under optional `snapshot.details`, separate from the standardized fields. For example, `class HttpError extends Error { status = 503; context = { retryable: true }; }` yields `details: { status: 503, context: { retryable: true } }`. Include own string-keyed data properties, including non-enumerable custom fields; exclude the separately handled name/message/stack/cause. A custom field named `details` is preserved as `snapshot.details.details`. Do not copy inherited methods, symbols or private class fields. Recognize valid existing snapshots and normalize their details in place structurally, without repeatedly nesting details.
- Recursively preserve JSON-safe custom primitives, arrays and object data fields. Normalize nested Errors to snapshots and Dates to ISO strings (invalid Dates get a marker). Use documented tagged plain-object markers such as `{ $ezrez: 'circular' }` for cycles, depth exhaustion, unreadable/accessor properties and unsupported values (undefined, functions, symbols, bigint, non-finite numbers and unsupported built-ins). These markers are informational, not a reversible codec; make clear that arbitrary custom values cannot be preserved losslessly under both JSON and structured clone. Normalize negative zero to zero. AggregateError's own `errors` data property is preserved through the same array/nested-Error path, not special recovery logic.
- Use guarded property-descriptor inspection; do not invoke custom-field getters. Guard standard error property reads and proxy reflection failures. Use path-based cycle detection (repeated non-cyclic references can be copied) and a documented depth limit of 16 across causes and details, with terminal snapshots for truncated causes and markers for truncated detail values. Safely define keys including `__proto__` without prototype mutation. Do not depend solely on `instanceof Error`, which misses cross-realm errors.
- Validate optional snapshot details as finite, acyclic JSON data in the structural guard without claiming to recover the original custom Error class/type. Document that snapshots preserve custom data, not prototypes or behavior, and that stack traces/custom fields may contain sensitive information requiring caller redaction before transport.
- Keep normalization out of the constructor dependency path: `fail({ type: 'NETWORK', message: 'Request failed', cause: normalizeCause(error) })`. Both operations are accessible through the root namespace.
- `define(callback)` infers its parameter tuple and branch return union `R`, exposing `(...args: Args) => Normalize<R>`. Return the same callback at runtime; do not catch exceptions or transform values. Localize and justify any implementation-only type assertion.
- Support ordinary synchronous, non-generic callbacks, including optional/rest parameters. Reject non-result and Promise-returning callbacks. Overload/generic/explicit-this preservation is not promised; those functions should use native inference or an explicit return annotation. Any lost branch correlation and editor alias-display limitations must be documented.

### Usage target

```ts
import * as ez from 'ezrez';

function load(id: string) {
  if (!id) return ez.fail({ type: 'INVALID_ID', message: 'ID required' });
  return ez.ok({ id });
}
// Native: Ok<{ id: string }> | Fail<{ type: 'INVALID_ID'; ... }>
// ErrorOf<ReturnType<typeof load>> retains 'INVALID_ID'.
const normalizedLoad = ez.define(load);
// Public return signature: EzRez<{ id: string }, InvalidIdFailure>
const count = ez.define(() => ez.ok(1));
// Public return signature: EzRez<number, never>
```

### Packaging

- Publish three named-export entry points: root re-exports core and utils; `ezrez/core` excludes utils; `ezrez/utils` exposes helpers. Utilities may depend on core, never the reverse. No `/func` export is needed.
- Extend tsup's named entries to emit `index`, `core/index` and `utils/index` with ESM/CJS declarations. Mirror actual emitted paths in npm exports and source paths in JSR's export map.
- Expand JSR publish inclusion to all production modules, excluding tests/reference sources. Keep `.js` relative module specifiers consistent with the established setup and verify JSR resolution.
- Exclude `src/old_reference_implementation/**` from active typecheck/test discovery and publication. Leave its files unchanged as reference material; its extensionless imports and tests are not the new implementation's acceptance suite.

## Files to modify

- `packages/ezrez/src/index.ts`, `src/index.test.ts`: public barrel and updated export smoke tests.
- New `packages/ezrez/src/core/{index,types,constructors,guards}.ts` and adjacent runtime/type tests.
- New `packages/ezrez/src/utils/{index,normalize-cause,define}.ts` and adjacent tests.
- `packages/ezrez/{package.json,deno.json,tsup.config.ts,tsconfig.json,vitest.config.ts}`: exports, build entries, verification scripts and reference exclusions.
- `packages/ezrez/scripts/verify-consumers.mjs`; new `scripts/verify-tree-shaking.mjs` and small consumer fixtures as needed.
- `packages/ezrez/README.md`: API, serialization contract and incremental scope.
- `bun.lock` only if an explicit bundler test dependency is added during implementation; do not rely on an undeclared transitive dependency.

## Reuse

- `old_reference_implementation/ezRez/core.ts`: plain-object constructors and structural validation pattern (adapt, not copy blindly).
- `old_reference_implementation/ezRez/types.ts`: discriminated result and tagged failure concepts.
- `old_reference_implementation/ezRez/methods.ts`: `runtimeError` supplies the Error/error-like message fallback intent, but its raw `{ error }` payload must not be copied. Recovery/extraction and sync/async adapters are deferred.
- `old_reference_implementation/ezRez/ezrez-utils.ts`: factory intent retained for later iterations; do not port its auth-specific commentary or default-data machinery now.
- Existing build, testing and publication setup.

## Steps

- [x] Agree on serialization, native inference plus optional wrapping, free redesign, null causes and incremental scope.
- [x] Establish test/typecheck boundaries and prototype result types, constructor inference, predicates and `define` with compile-time fixtures. Typecheck and initial tests pass on TypeScript 5.9; also exclude reference sources from Biome.
- [x] Implement core constructors and guards with data-only results and no utility dependency. Core runtime and inference tests pass.
- [x] Implement defensive cause normalization and the identity `define` helper. 15 tests pass, covering custom fields, JSON/clone transport, hostile objects, cycles and depth limits.
- [x] Wire the three npm/JSR entry points and update export smoke/consumer tests. Actual npm tarball ESM/CJS runtime and declaration consumers pass; JSR dry run resolves the full source graph with existing `.js` specifiers and excludes tests/reference files.
- [x] Add runtime, inference, serialization and tree-shaking regression coverage. Package check passes (18 tests plus tsc assertions). Bun browser ESM checks measure constructor-only root/core imports at 140 bytes named / 160 bytes namespace; used normalization is 3,920 bytes. CI runs the new tree-shaking check without added dependencies.
- [x] Document native-first usage, optional normalization, serialization limitations, cause-stack/custom-field sensitivity, custom-field preservation and normalization limits, and deferred features. See `packages/ezrez/README.md`.

## Verification

- Compile-time tests, actually checked by `tsc` (not only Vitest transpilation): multiple success/failure branches, custom error unions/data, default/error `never`, failure-only/both-never cases, assignment to explicit `EzRez<S,E>`, constructor literal inference, guard narrowing, native async functions via `Awaited<ReturnType<...>>`, and no-error extraction. Use positive assertions and `@ts-expect-error` negative cases.
- `define` tests: identical callback reference, inferred argument tuples, success-only/failure-only/mixed normalized signatures, optional/rest arguments, and rejection of non-results/async callbacks. Confirm exceptions propagate unchanged.
- Runtime tests: constructor shapes, absent cause becoming null, preservation of custom fields, valid/malformed envelopes and snapshots, branch conflicts, primitives and hostile objects. Cause tests cover native/cross-realm Errors, nested causes, existing snapshots (no details re-nesting), non-Error throws, cycles, depth limits and throwing getters. Add custom Error subclasses with enumerable/non-enumerable fields, nested JSON data, reserved-name collisions, nested Errors/AggregateError, Dates, unsupported-value markers, repeated references, symbol/private-field exclusions, proxy reflection failures and `__proto__` keys. Assert custom data survives both transport round trips and custom getters/toJSON are not executed.
- For supported payload fixtures, assert equality after both `JSON.parse(JSON.stringify(result))` and `structuredClone(result)`, including failure causes and guard acceptance after transport. Explicitly test/document unsupported unrestricted payloads and lossy error normalization; no blanket guarantee for arbitrary values.
- Bundle ESM consumers using both named imports and static namespace access from root and core. Assert unused normalization/define code is absent; verify a used utility remains. Include a small bundle-size regression ceiling calibrated to the first implementation. Do not promise CJS or dynamic-namespace tree shaking.
- Extend consumer verification beyond import-only checks: execute constructors/guards from all three ESM/CJS entry points and compile `.mts`/`.cts` type fixtures against built declarations. Check packed contents/exports and JSR source graph, excluding tests/reference files.
- From `packages/ezrez`, run `bun run check`, `bun run test:consumers`, the new tree-shaking script, `bun run pack:check`, and `bun run jsr:check`; run monorepo build/check for integration.

## Execution results

- All implementation steps complete. TypeScript 5.9 retained; no dependency or lockfile changes required. Reference implementation left intact.
- Monorepo check passes, including 18 library tests and type assertions. Library ESM/CJS/declaration builds, packed consumers, browser tree-shaking, npm pack inspection and JSR dry run all pass.
- Biome exclusions were also corrected to ignore nested workspace `dist`, `coverage` and `node_modules` directories, so rebuilding no longer invalidates formatting checks. CI now includes tree-shaking verification.
- Docs static routes built, but the existing Pagefind integration emitted `jemalloc: Unsupported system page size` and a memory-allocation failure on this machine despite exiting zero. Docs search generation is therefore not verified; no unrelated docs/toolchain changes were made.
