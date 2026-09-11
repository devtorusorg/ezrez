# TypeScript library setup plan

## Context

The working directory is empty and is not yet a Git repository. The library will be named `ezrez` on npm, target browser and Node without runtime-specific APIs, and be published to both npm and JSR. npm consumers need ESM and CommonJS support; JSR consumers will receive TypeScript source through an explicit JSR export map.

## Approach

- Use Bun for dependency management and scripts, with TypeScript source in `src/` and a single public API entry point.
- Build npm artifacts as both ESM and CommonJS, plus declaration files, using `tsup`.
- Publish the original TypeScript source to JSR as `@devtorus/ezrez` through `deno.json`, with an explicit JSR export map.
- Include Vitest, Biome, GitHub Actions, and Release Please-based release automation. Biome is the single formatter/linter: it is stable, fast, and avoids separate ESLint/Prettier configuration for this small pure-TypeScript library. Release Please will keep the npm `package.json` version and JSR `deno.json` version synchronized in its release PR; a release workflow will publish that tagged version to both registries.

## Files to modify

- `package.json` (new)
- `tsconfig.json` (new)
- `tsup.config.ts` (new)
- `deno.json` (new; JSR name `@devtorus/ezrez`)
- `src/index.ts`, `src/index.test.ts` (new)
- `.gitignore`, `README.md`, `LICENSE`, `biome.json`, `bun.lock` (new)
- `vitest.config.ts`, `scripts/verify-consumers.mjs` (new)
- `.github/workflows/{ci,release-please,publish}.yml`, `release-please-config.json`, `.release-please-manifest.json` (new)

## Reuse

No existing project files or utilities are available.

## Steps

- [x] Initialize a Git/Bun project with `ezrez` npm metadata, MIT license, Node 18+ engine declaration, browser-oriented keywords, and a README that documents npm (`ezrez`) and JSR (`@devtorus/ezrez`) installation/imports.
- [x] Configure strict TypeScript for runtime-agnostic browser/Node source and a `src/index.ts` public API boundary. Use `.js` internal import specifiers where source modules are split, so source remains valid for both Node ESM and JSR/Deno resolution.
- [x] Add `tsup.config.ts` to emit `dist/index.js` (ESM), `dist/index.cjs` (CJS), source maps, and `dist/index.d.ts`. Define an npm `exports` map with `types`, `import`, and `require` conditions; use `files` to publish only built artifacts and package documentation/license.
- [x] Add `deno.json` with name `@devtorus/ezrez`, matching version metadata, and an export of `./src/index.ts`. Keep JSR configuration source-based rather than pointing at npm's generated `dist/` files.
- [x] Add Vitest (including browser-neutral test environment), Biome configuration for formatting and TypeScript-aware linting, editor ignore/config files, and Bun scripts for format checking, linting, type checking, tests, npm build, npm pack inspection, and JSR dry-run validation.
- [x] Add GitHub Actions: pull-request/push validation runs Bun install, formatting, linting, types, tests, npm build/pack, and JSR dry run; releases use Release Please to create version PRs while updating both JSON manifests, then publish the released tag to npm (token) and JSR (trusted GitHub OIDC) after registry credentials are configured.
- [x] Document required npm token/repository permissions and JSR GitHub linking, plus the first-release bootstrap steps.

## Verification

- Run Bun formatting and linting through Biome, type checking, tests, and npm production build.
- Inspect the packed npm tarball and verify `import` (ESM), `require` (CJS), and TypeScript declarations against small Node ESM and CJS consumer fixtures.
- Run `bunx jsr publish --dry-run` (or equivalent JSR validation) and import the source export in a JSR/Deno-compatible fixture.
- Confirm that the release workflow has the required npm token, GitHub OIDC permissions, and version synchronization before enabling publication.
