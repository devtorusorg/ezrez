import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureDirectory = mkdtempSync(join(tmpdir(), "ezrez-consumer-"));
const packageDirectory = join(fixtureDirectory, "node_modules", "ezrez");

try {
  // Exercise the actual tarball, not a symlink that can hide missing published files.
  const [packed] = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--pack-destination", fixtureDirectory], {
      cwd: projectRoot,
      encoding: "utf8",
    }),
  );
  assert(
    packed.files.every(({ path }) => !path.includes("old_reference") && !path.includes(".test.")),
  );
  mkdirSync(packageDirectory, { recursive: true });
  execFileSync("tar", [
    "-xzf",
    join(fixtureDirectory, packed.filename),
    "--strip-components=1",
    "-C",
    packageDirectory,
  ]);

  for (const mode of ["module", "commonjs"]) {
    const imports =
      mode === "module"
        ? 'import * as ez from "ezrez"; import * as core from "ezrez/core"; import * as utils from "ezrez/utils";'
        : 'const ez = require("ezrez"), core = require("ezrez/core"), utils = require("ezrez/utils");';
    execFileSync(
      process.execPath,
      [
        `--input-type=${mode}`,
        "--eval",
        `${imports}
      const result = core.fail({ type: "IO", message: "Failed", cause: utils.normalizeCause(new Error("disk")) });
      if (!ez.isError(result) || !ez.isEzRez(result) || result.failure.cause.message !== "disk") throw Error("invalid result");
      if (!core.isSuccess(ez.ok(1)) || utils.define(() => ez.ok(2))().value !== 2) throw Error("invalid helper");
      if ("normalizeCause" in core || "ok" in utils) throw Error("invalid entry boundary");
    `,
      ],
      { cwd: fixtureDirectory, stdio: "inherit" },
    );
  }

  const types = `
    import * as ez from "ezrez";
    import { ok, fail, isError, type EzRez, type ErrorOf } from "ezrez/core";
    import { define, normalizeCause } from "ezrez/utils";
    const fn = (flag: boolean) => flag ? ok(1) : fail({ type: "IO", message: "", cause: normalizeCause(new Error()) });
    type E = ErrorOf<ReturnType<typeof fn>>;
    const normalized: (flag: boolean) => EzRez<number, E> = define(fn);
    const result = normalized(false);
    if (isError(result)) { const tag: "IO" = result.failure.type; void tag; }
    const onlyOk: EzRez<number, never> = ez.ok(1);
    // @ts-expect-error No failure branch exists in a success-only result.
    const invalid: EzRez<number> = fail({ type: "NO", message: "" });
    // @ts-expect-error A native Error is not an ErrorSnapshot.
    fail({ type: "NO", message: "", cause: new Error() });
    // @ts-expect-error No arbitrary application validator generic is accepted.
    ez.isEzRez<EzRez<number>>(result);
    void onlyOk; void invalid;
  `;
  for (const extension of ["mts", "cts"])
    writeFileSync(join(fixtureDirectory, `consumer.${extension}`), types);
  execFileSync(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "consumer.mts",
      "consumer.cts",
    ],
    {
      cwd: fixtureDirectory,
      stdio: "inherit",
    },
  );
  console.log(
    "Packed ESM/CJS runtime and declaration consumers passed for all three entry points.",
  );
} finally {
  rmSync(fixtureDirectory, { force: true, recursive: true });
}
