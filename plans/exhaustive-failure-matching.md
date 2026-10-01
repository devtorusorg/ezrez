# Exhaustive failure matching plan

## Context

Handling a result with many possible failure tags should be concise, type-safe, and compile-time exhaustive. The requested direction is an object-based matching helper, informed by Effect's matching/recovery APIs and complementary to composable catchers.

The active v2 API currently exposes constructors, guards, result types, and cause normalization only. `ezTry`, `ezCatchType`, and related recovery helpers exist only in `packages/ezrez/src/old_reference_implementation/`; the current README explicitly says recovery chains are deferred. This change will design the complete v2 matching/recovery helper family rather than porting the historical names or signatures.

## Approach

Add result control-flow helpers to the existing `ezrez/utils` entry point and re-export them from the package root. Keep `ezrez/core` limited to constructors, guards, and foundational types. Utilities may import core, while core must not import utilities.

Use three complementary API layers:

1. **Terminal exhaustive matching** — make this the easiest and recommended option when every branch must produce a plain value:

   ```ts
   const message = match(result, {
     success: (value) => `Loaded ${value.name}`,
     errors: {
       NOT_FOUND: (failure) => failure.cause.message,
       UNAUTHORIZED: () => "Sign in",
       OFFLINE: () => "Retry later",
     },
   });
   ```

   `match` requires `success` whenever the input can succeed and requires exactly every possible failure tag. Each error callback receives `Extract<ErrorOf<R>, { tag: K }>` and the return type is the union of all branch outputs. Provide data-first inference (`match(result, cases)`) and an explicitly typed reusable form (`match<R>()(cases)(result)`); do not add a generic pattern-matching DSL. Exhaustive APIs require a finite literal tag union: a widened `Fail<string>` must use partial matching plus `catchAll` (or first narrow the boundary value), because TypeScript cannot prove an arbitrary string set exhaustive.

2. **Composable recovery** — retain the useful catcher model, updated for v2's outer `tag`:
   - `catchTag(tag, handler)` handles one tag.
   - `catchTags(handlers)` handles a subset from an object, mirroring Effect's partial `catchTags`; unhandled input failures remain in the output type.
   - `catchAllTags(handlers)` requires every tag and removes all original input failures from the output type. This is the requested many-failure checked helper.
   - `catchAll(handler)` handles the remaining failure union and acts as an explicit fallback.
   - `recover(...catchers)` applies the first matching catcher, passes successes through unchanged, and returns a reusable result transformer. Also provide a data-first overload so ordinary calls can infer the input result without annotations.

   Use prefix-free public names throughout. They read naturally both as named imports (`match`, `recover`, `catchTag`, `getOr`) and through the recommended namespace style (`ez.match`, `ez.recover`, `ez.catchTag`, `ez.getOr`). `recover` is clearer than preserving historical `ezTry`: these helpers transform existing result values and do not execute exception-catching `try` blocks. Do not add duplicate `ez*` aliases because the active v2 API has no compatibility obligation to the reference implementation.

   Recovery callbacks return another `AnyResult`, not arbitrary values; their success and failure branches are merged into the output while handled input branches are removed. Match callbacks return arbitrary values and consume the whole result. This distinction avoids one overloaded helper doing two different jobs.

3. **Simple value fallback** — include `getOr(result, fallback)` in this pass. It returns the success value unchanged or the supplied fallback when the result is a failure. The result controls the generic and `fallback` must be assignable to `SuccessOf<R>` (using `NoInfer` or an equivalent constraint so the fallback cannot silently widen the success type). Keep this deliberately value-only and data-first; a lazy/computed `getOrElse` can be considered later if a concrete use case justifies it. This helper is small, commonly useful, and shares the same narrowing/type-test work, so postponing it would create a second release for little benefit.

Follow Effect's useful distinctions rather than copying its machinery: `Effect.catchTags` motivates partial keyed recovery and removal of handled errors; `Match.tagsExhaustive` motivates a separate exhaustive keyed form; `Effect.match` motivates explicit success/failure folding. Reject unknown object keys in both partial and exhaustive maps.

Keep async behavior predictable with explicit runner variants rather than inspecting `AsyncFunction` or returning a value-or-Promise depending on the selected branch:

- `recover` and `match` accept synchronous handlers only and return synchronously.
- `recoverAsync` and `matchAsync` accept sync or async handlers, accept a result or promised result where useful, and always return `Promise`.
- Catcher constructors are shared; their handler return types determine whether the sync runner accepts them, so no duplicated `*Async` catcher constructors or runtime `isAsync` flag are needed.

All catcher descriptors remain small plain data objects with no classes, symbols, mutation, or module initialization. Exact overload/type shapes will be prototyped before runtime implementation because contextual callback typing and sequential removal of handled failures are the main TypeScript risks. For inputs that evade the static contract, recovery treats an unknown/unhandled tag as unmatched and passes it through; terminal exhaustive matching throws a deterministic `TypeError` rather than invoking `undefined`.

## Files to modify

- New `packages/ezrez/src/utils/{types,catch,match,get-or}.ts` (final split may combine very small modules): public helper types, catchers/runners, exhaustive matchers, and value fallback.
- New adjacent `packages/ezrez/src/utils/*.test.ts`: runtime and `tsc`-checked API contracts.
- `packages/ezrez/src/utils/index.ts`, `src/index.ts`, and `src/index.test.ts`: utility/root re-exports and entry-boundary assertions; `src/core/index.ts` remains helper-free.
- `packages/ezrez/scripts/{verify-consumers.mjs,verify-tree-shaking.mjs}`: packaged declarations/runtime and dependency-boundary regression coverage through the existing root/core/utils entries.
- `packages/ezrez/playground.ts` and `packages/ezrez/README.md`: examples, sync/async semantics, exhaustive diagnostics, and core/utils entry-point guidance.

Only add narrowly reusable tag/branch extraction types to `packages/ezrez/src/core/types.ts` and its barrel if helper prototypes show they are useful foundational public types; otherwise keep implementation-only mapped types in `utils/types.ts`. Existing npm/JSR/build globs already publish `src/utils`, so no new package subpath or build entry is needed. The historical implementation remains unchanged as reference material.

## Reuse

- `packages/ezrez/src/core/types.ts`: `AnyResult`, `ErrorOf`, `Fail`, `Normalize`, `Ok`, `SuccessOf`, and the correlation between tags and typed causes.
- `packages/ezrez/src/core/guards.ts`: `isSuccess`/`isError` for runtime branching without duplicating envelope checks.
- `packages/ezrez/src/old_reference_implementation/ezRez/methods.ts`: first-match `ezTry`, typed/default catcher, and object failure-mapping intent; replace its obsolete nested failure shape, broad defaults, overload complexity, and runtime async flag.
- Existing package export, packed-consumer, and tree-shaking checks for enforcing dependency boundaries.
- Effect's public `catchTags`, `Match.tagsExhaustive`, and `match` API concepts, adapted to plain eager results rather than introducing Effect-style pipelines or patterns.

## Steps

- [ ] Prototype helper types and overloads in checked fixtures before runtime work: data-first inference, explicitly typed reusable forms, exact/partial tag maps, callback contextual typing, branch return unions, handled-error subtraction, catcher ordering, and sync rejection of Promise handlers.
- [ ] Implement plain catcher descriptors plus `catchTag`, partial `catchTags`, exhaustive `catchAllTags`, and `catchAll`; ensure keyed callbacks receive their exact correlated `Fail` branch.
- [ ] Implement `recover` as a synchronous first-match transformer with success passthrough and precise output normalization; implement `recoverAsync` with the same semantics and an unconditional Promise result.
- [ ] Implement exhaustive whole-result `match` and `matchAsync`, including impossible-branch behavior for success-only and failure-only results and runtime defensive behavior for widened/dishonest inputs.
- [ ] Implement data-first `getOr` with a value fallback constrained by the input result's success type; defer lazy fallback APIs.
- [ ] Export the new functions from the existing utils and root barrels while preserving the core boundary and tree shaking.
- [ ] Add examples and documentation that lead with `match` for terminal handling, use `catchAllTags` for exhaustive recovery, show `getOr` for the simple fallback case, and explain when partial catchers or `catchAll` are appropriate.
- [ ] Extend runtime, compile-time, packed-consumer, and bundle-boundary coverage; leave old reference files untouched.

## Verification

- Type tests prove exhaustive maps require all and only known tags; partial maps retain unhandled branches; each callback receives only its correlated failure (including typed cause context); and heterogeneous handler outputs are preserved and normalized.
- Type tests cover success-only, failure-only, `never`, broad/dynamic string tags, same-tag correlated branches, sequential catchers, fallback removal, direct inference, reusable explicit forms, sync/async handler acceptance, and actionable missing/extra-key diagnostics. `getOr` returns `SuccessOf<R>`, accepts same-type/subtype values, and rejects unrelated fallbacks without widening `R`; failure-only results are rejected because they have no success type.
- Runtime tests cover success passthrough, each tag, first-match ordering, partial non-matches, exhaustive recovery, `getOr` on both branches, terminal success/error matching, rejected Promise use in sync APIs at type level, and always-Promise async APIs with sync/async handlers and promised inputs.
- Public API tests confirm helpers appear in root and `ezrez/utils`, but not `ezrez/core`. Browser bundles importing only `ok` must not retain utility/helper dispatch code; importing one lightweight helper must not pull in cause normalization or unrelated helpers.
- Packed ESM/CJS declaration consumers exercise direct and curried forms from root and `/utils`; npm and JSR package checks continue covering the existing entries and excluding tests/reference files.
- From `packages/ezrez`, run `bun run check`, `bun run test:consumers`, `bun run test:tree-shaking`, `bun run pack:check`, and `bun run jsr:check`, followed by the monorepo check/build.
