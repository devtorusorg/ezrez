# Failure type shorthand

## Context

Current `EzRez<S, E>` requires complete `Failure` objects, making simple tagged errors verbose. Add `EzFailOf<"TAG">` and allow string-tag unions directly in `EzRez` and rename the failure discriminator from `type` to `tag` in constructor inputs, types and serialized results. Native inference and the optional `define` utility remain first-class.

## Approach

- Introduce type-only `EzFailOf<T extends string>` for the failure payload (not the `Fail` envelope): `{ tag: T; message: string; cause: ErrorSnapshot | null }`. Distribute over tag unions so each tag is its own discriminated member; `EzFailOf<never>` is `never`.
- Widen `EzRez`'s error input to `string | Failure`, defaulting to `never`. Internally distribute normalization: strings become `EzFailOf<Tag>`; complete failure objects remain unchanged.
- Retain structural custom error types and their per-tag fields. Permit mixed string/object unions, using objects for tags that require custom data. Both union-string helpers and mixed unions are confirmed.
- Rename the required discriminator in `Failure` and `FailureInput` to `tag`. Use `fail({ tag: "DIVIDE_BY_ZERO", message: "Cannot divide by zero" })` and `result.failure.tag`. Update structural validation to require a string `tag`, including the normalizer's internal synthetic failure used for snapshot validation.
- This is an intentional breaking API/wire-format change: no legacy `type` alias or automatic migration. A type-only legacy failure must fail validation/typechecking; if an object also has a valid `tag`, an unrelated custom `type` field may remain ordinary custom data. Do not rename TypeScript `type` keywords, package metadata `type`, native Error fields or arbitrary custom error details. Leave old reference sources and historical plans untouched.
- Keep `ErrorOf<R>` returning complete failure objects, not strings; `Normalize`/`define` continue extracting complete objects. Cause normalization behavior and import boundaries remain unchanged.
- Explicit tag-only annotations expose only base failure fields; users needing typed custom fields should use a complete object variant or native inference.

## Files to modify

- `packages/ezrez/src/core/types.ts`: rename failure discriminator, add public helper and private error-input normalization.
- `packages/ezrez/src/core/{constructors,guards,normalize-cause}.ts`: update discriminator-dependent code/comments and internal snapshot-validation envelope as needed.
- `packages/ezrez/src/core/index.ts`: type-only export; root already re-exports core.
- `packages/ezrez/src/core/{types,core,serialization}.test.ts`, `src/utils/{define,normalize-cause}.test.ts`: migrate active failure fixtures and add inference, narrowing, validation and transport assertions.
- `packages/ezrez/scripts/verify-consumers.mjs`: built ESM/CJS declarations for both shorthand forms.
- `packages/ezrez/playground.ts`: replace verbose/duplicate divide examples with uniquely named shorthand examples; retain intentional diagnostics.
- `packages/ezrez/README.md`: migrate examples to `tag`; explain shorthand, custom errors, annotation tradeoffs and the breaking discriminator rename. Search active docs/fixtures for remaining failure-specific `type` usage.

## Reuse

- `src/core/types.ts`: `Failure`, `ErrorSnapshot`, `Fail`, impossible-branch checks, `ErrorOf` and `Normalize`.
- `src/core/guards.ts`: existing typed branch narrowing and boundary validation; adapt to `tag`, do not create new guards.
- `src/utils/define.ts`: existing return normalization; no new wrapper.
- Existing compile-time fixtures, packed declaration consumers and publishing checks.

## Steps

- [x] Confirm mixed-union behavior and helper meaning: `EzFailOf` accepts single tags or tag unions and describes failure payloads; `EzRez` accepts tags, complete failure objects, or mixed unions.
- [x] Rename the active failure discriminator to `tag` in types, validation and fixtures, including the normalizer's synthetic envelope.
- [x] Add distributive shorthand types and type-only exports, preserving no-error `never` behavior.
- [x] Add type regression cases for literal/union tags, complete/mixed failure variants, narrowing and wrapper/native use. New focused coverage in `src/core/shorthand.test.ts` supplements the migrated existing fixtures.
- [x] Update playground examples, README and packed consumer fixtures.
- [x] Run package, build, consumer, tree-shaking and JSR checks. All pass: formatting, lint, tsc assertions, 22 tests, packed ESM/CJS runtime/declarations, browser tree shaking, npm pack and JSR dry run. No dependency changes; reference implementation unchanged.

## Verification

- `EzFailOf<"A" | "B">` is a discriminated failure-payload union; `Extract<..., { tag: "A" }>` works.
- `EzRez<number, "A" | "B">` accepts matching constructors and rejects unknown tags/non-string error inputs.
- `fail({ tag: "A", message: "" })` preserves the literal tag; legacy `fail({ type: "A", message: "" })` is a compile-time error. `isEzRez` rejects legacy type-only payloads and malformed/non-string tags, but accepts correct tagged results after JSON/structured-clone transport. Extra custom `type` fields and custom native Error details are not renamed.
- Defaults, explicit `never`, failure-only and both-never branches retain existing behavior.
- Complete failure objects preserve required fields/correlations; mixed unions narrow correctly.
- `ErrorOf`, native inferred returns, explicit annotations, `define` and guards remain compatible; annotations do not claim to retain unlisted custom fields.
- `bun run check`, `bun run test:consumers`, `bun run test:tree-shaking`, `bun run pack:check`, `bun run jsr:check` from the package. Playground stays excluded; valid examples are mirrored in checked fixtures.
