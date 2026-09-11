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
- Native inference is first-class; no wrapper is required for constructors, narrowing or extraction.
- Always include `cause` on produced failures; use `null` when absent.
- Initial increment: constructors, guards, type extraction and cause normalization. Defer factories,
  recovery chains, exception-catching adapters, async wrappers and other helpers.

### Core API and types

Preserve the useful reference wire shape, without preserving old function names:

```ts
type JsonValue = string | number | boolean | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
interface ErrorSnapshot {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly cause: ErrorSnapshot | null;
  readonly context?: Readonly<Record<string, JsonValue>>;
}
type ErrorDescriptor = Readonly<{
  name?: string;
  message?: string;
  stack?: string;
  cause?: unknown;
  context?: Readonly<Record<string, JsonValue>>;
}>;
type Failure = Readonly<{
  cause: ErrorSnapshot;
}>;
interface Ok<S> {
  readonly tag: "success";
  readonly value: S;
  readonly cause?: never;
}
interface Fail<Tag extends string, Cause extends ErrorSnapshot = ErrorSnapshot> {
  readonly tag: Tag;
  readonly cause: Cause;
  readonly value?: never;
}
type EzRez<S, E extends string | Fail<string> = never> =
  | ([S] extends [never] ? never : Ok<S>)
  | ([E] extends [never] ? never : ResolveFailure<E>);
```

- `ok(value)` returns only `Ok<S>`, never a broad result that introduces phantom failures.
- `fail(tag)` and `fail({ tag })` return an exact `Fail<Tag>` envelope with the default `{ name: "Error", message: tag, cause: null }` snapshot.
- `fail(tag, descriptor)` and `fail({ tag, ...descriptor })` merge defined Error fields into that default. Descriptor `cause` is the snapshot's nested cause. `fail(tag, nativeError)` instead normalizes the Error directly as the primary snapshot. The `"success"` tag is reserved; no application data or separate outer message is accepted.
- `isSuccess(result)` and `isError(result)` narrow existing typed results using the outer tag while preserving exact input branches.
- `isEzRez(unknown)` validates exact tagged envelopes and top-level causes, rejecting extra fields, conflicting branch fields, and obsolete failure containers. It must not pretend to validate arbitrary caller-selected payload/error generics. Success payload contents remain unchecked.
- Export `SuccessOf<R>`, `ErrorOf<R>` and `Normalize<R>` using distributive branch extraction. `ErrorOf` extracts complete `{ tag, cause }` failure envelopes. Success-only errors and failure-only successes resolve to `never`; `EzRez<never, never>` is `never`.
- No classes, symbols, prototype methods, executable fields, freezing or module initialization side effects. Readonly is a TypeScript contract, not deep runtime immutability.

### Utilities

- `normalizeCause(unknown): ErrorSnapshot | null` produces fresh JSON-safe plain data. Null/undefined become null; Errors and error-like objects contribute name/message/stack and recursively normalized causes. Primitive thrown values get a deterministic name/message; unrecognized objects get a stable fallback message plus safely normalized own fields, never arbitrary `JSON.stringify` or user `toJSON` execution.
- Preserve custom error fields under optional `snapshot.context`, separate from the standardized fields. For example, `class HttpError extends Error { status = 503; context = { retryable: true }; }` yields `context: { status: 503, context: { retryable: true } }`. Include own string-keyed data properties, including non-enumerable custom fields; exclude the separately handled name/message/stack/cause. A custom field named `context` is preserved as `snapshot.context.context`. Do not copy inherited methods, symbols or private class fields. Recognize valid existing snapshots and normalize their context structurally without repeatedly nesting it.
- Recursively preserve JSON-safe custom primitives, arrays and object data fields. Normalize nested Errors to snapshots and Dates to ISO strings (invalid Dates get a marker). Use documented tagged plain-object markers such as `{ $ezrez: 'circular' }` for cycles, depth exhaustion, unreadable/accessor properties and unsupported values. These markers are informational, not a reversible codec.
- Use guarded property-descriptor inspection; do not invoke custom-field getters. Guard standard error property reads and proxy reflection failures. Use path-based cycle detection and a depth limit of 16 across causes and context. Safely define keys including `__proto__` without prototype mutation.
- Validate optional snapshot context as finite, acyclic JSON data without claiming to recover the original custom Error class/type. Document that snapshots preserve custom data, not prototypes or behavior.
- `fail(tag, nativeError)` normalizes native Errors through the core normalization implementation.
  The public `normalizeCause` utility remains available for callers that need an explicit snapshot.

### Usage target

```ts
import * as ez from 'ezrez';

function load(id: string) {
  if (!id) return ez.fail({ tag: 'INVALID_ID' });
  return ez.ok({ id });
}
// Native: Ok<{ id: string }> | Fail<'INVALID_ID'>
// ErrorOf<ReturnType<typeof load>> retains 'INVALID_ID'.
```

### Packaging

- Publish three named-export entry points: root re-exports core and utils; `ezrez/core` excludes utils; `ezrez/utils` exposes helpers. Utilities may depend on core, never the reverse. No `/func` export is needed.
- Extend tsup's named entries to emit `index`, `core/index` and `utils/index` with ESM/CJS declarations. Mirror actual emitted paths in npm exports and source paths in JSR's export map.
- Expand JSR publish inclusion to all production modules, excluding tests/reference sources. Keep `.js` relative module specifiers consistent with the established setup and verify JSR resolution.
- Exclude `src/old_reference_implementation/**` from active typecheck/test discovery and publication. Leave its files unchanged as reference material; its extensionless imports and tests are not the new implementation's acceptance suite.

## Files to modify

- `packages/ezrez/src/index.ts`, `src/index.test.ts`: public barrel and updated export smoke tests.
- New `packages/ezrez/src/core/{index,types,constructors,guards}.ts` and adjacent runtime/type tests.
- New `packages/ezrez/src/utils/{index,normalize-cause}.ts` and adjacent tests.
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
- [x] Establish test/typecheck boundaries and prototype result types, constructor inference and predicates with compile-time fixtures. Typecheck and initial tests pass on TypeScript 5.9; also exclude reference sources from Biome.
- [x] Implement core constructors and guards with data-only results and no utility dependency. Core runtime and inference tests pass.
- [x] Implement defensive cause normalization. Tests cover custom fields, JSON/clone transport, hostile objects, cycles and depth limits.
- [x] Wire the three npm/JSR entry points and update export smoke/consumer tests. Actual npm tarball ESM/CJS runtime and declaration consumers pass; JSR dry run resolves the full source graph with existing `.js` specifiers and excludes tests/reference files.
- [x] Add runtime, inference, serialization and tree-shaking regression coverage. Package check passes (18 tests plus tsc assertions). Bun browser ESM checks measure constructor-only root/core imports at 140 bytes named / 160 bytes namespace; used normalization is 3,920 bytes. CI runs the new tree-shaking check without added dependencies.
- [x] Document native-first usage, optional normalization, serialization limitations, cause-stack/custom-field sensitivity, custom-field preservation and normalization limits, and deferred features. See `packages/ezrez/README.md`.

## Verification

- Compile-time tests, actually checked by `tsc` (not only Vitest transpilation): multiple success/failure branches, exact failure envelopes, default/error `never`, failure-only/both-never cases, assignment to explicit `EzRez<S,E>`, constructor literal inference, guard narrowing, native async functions via `Awaited<ReturnType<...>>`, correlated descriptor context and no-error extraction. Use positive assertions and `@ts-expect-error` negative cases.
- Runtime tests: constructor shapes, absent cause becoming null, rejection of extra envelope fields, valid/malformed envelopes and snapshots, branch conflicts, primitives and hostile objects. Cause tests cover native/cross-realm Errors, nested causes, existing snapshots without context re-nesting, non-Error throws, cycles, depth limits, throwing getters, and Error-owned custom context.
- For supported payload fixtures, assert equality after both `JSON.parse(JSON.stringify(result))` and `structuredClone(result)`, including failure causes and guard acceptance after transport. Explicitly test/document unsupported unrestricted success payloads and lossy error normalization.
- Bundle ESM consumers using both named imports and static namespace access from root and core. Assert unused normalization code is absent; verify a used utility remains. Include a small bundle-size regression ceiling calibrated to the first implementation. Do not promise CJS or dynamic-namespace tree shaking.
- Extend consumer verification beyond import-only checks: execute constructors/guards from all three ESM/CJS entry points and compile `.mts`/`.cts` type fixtures against built declarations. Check packed contents/exports and JSR source graph, excluding tests/reference files.
- From `packages/ezrez`, run `bun run check`, `bun run test:consumers`, the new tree-shaking script, `bun run pack:check`, and `bun run jsr:check`; run monorepo build/check for integration.

## Execution results

- All implementation steps complete. TypeScript 5.9 retained; no dependency or lockfile changes required. Reference implementation left intact.
- Monorepo check passes, including 18 library tests and type assertions. Library ESM/CJS/declaration builds, packed consumers, browser tree-shaking, npm pack inspection and JSR dry run all pass.
- Biome exclusions were also corrected to ignore nested workspace `dist`, `coverage` and `node_modules` directories, so rebuilding no longer invalidates formatting checks. CI now includes tree-shaking verification.
- Docs static routes built, but the existing Pagefind integration emitted `jemalloc: Unsupported system page size` and a memory-allocation failure on this machine despite exiting zero. Docs search generation is therefore not verified; no unrelated docs/toolchain changes were made.
