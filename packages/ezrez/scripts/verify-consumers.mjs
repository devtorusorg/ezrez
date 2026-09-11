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
      const result = core.fail({ tag: "IO", message: "Failed", cause: utils.normalizeCause(new Error("disk")) });
      if (!ez.isError(result) || !ez.isEzRez(result) || result.failure.tag !== "IO" || result.failure.cause.message !== "disk") throw Error("invalid result");
      if (ez.isEzRez({ isSuccess: false, failure: { type: "LEGACY", message: "", cause: null } })) throw Error("legacy failure accepted");
      if (!core.isSuccess(ez.ok(1)) || utils.define(() => ez.ok(2))().value !== 2) throw Error("invalid helper");
      if ("normalizeCause" in core || "ok" in utils) throw Error("invalid entry boundary");
    `,
      ],
      { cwd: fixtureDirectory, stdio: "inherit" },
    );
  }

  const types = `
    import * as ez from "ezrez";
    import { ok, fail, isError, type EzRez, type EzFailOf, type ErrorOf } from "ezrez/core";
    import { define, normalizeCause } from "ezrez/utils";
    const fn = (flag: boolean) => flag ? ok(1) : fail({ tag: "IO", message: "", cause: normalizeCause(new Error()) });
    type E = ErrorOf<ReturnType<typeof fn>>;
    const normalized: (flag: boolean) => EzRez<number, "IO"> = define(fn);
    const result = normalized(false);
    if (isError(result)) { const tag: "IO" = result.failure.tag; void tag; }
    const onlyOk: EzRez<number, never> = ez.ok(1);
    // @ts-expect-error No failure branch exists in a success-only result.
    const invalid: EzRez<number> = fail({ tag: "NO", message: "" });
    const nativeCause = fail({ tag: "NO", message: "", cause: new Error() });
    const snapshotName: string | undefined = nativeCause.failure.cause?.name;
    void snapshotName;
    // @ts-expect-error No arbitrary application validator generic is accepted.
    ez.isEzRez<EzRez<number>>(result);
    void onlyOk; void invalid;

    type MathTag = "DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER";
    type MathFailure = EzFailOf<MathTag>;
    const divide = (a: number, b: number) => b === 0
      ? fail({ tag: "DIVIDE_BY_ZERO", message: "Cannot divide by zero" })
      : a > 100 ? fail({ tag: "TOO_BIG_NUMBER", message: "Too big" }) : ok(a / b);
    const byHelper: (a: number, b: number) => ez.EzRez<number, ez.EzFailOf<MathTag>> = define(divide);
    const exactTag: Extract<MathFailure, { tag: "DIVIDE_BY_ZERO" }> = { tag: "DIVIDE_BY_ZERO", message: "", cause: null };
    type TooBig = EzFailOf<"TOO_BIG_NUMBER"> & { limit: number };
    const mixed = (flag: boolean): EzRez<number, "DIVIDE_BY_ZERO" | TooBig> => flag
      ? fail({ tag: "TOO_BIG_NUMBER", message: "", limit: 100 }) : ok(1);
    const mixedResult = mixed(true);
    if (isError(mixedResult) && mixedResult.failure.tag === "TOO_BIG_NUMBER") {
      const limit: number = mixedResult.failure.limit; void limit;
    }
    // @ts-expect-error A tag shorthand cannot accept unrelated tags.
    const unknownTag: EzRez<number, MathTag> = fail({ tag: "OTHER", message: "" });
    // @ts-expect-error Legacy constructor inputs are rejected.
    fail({ type: "OLD", message: "" });
    // @ts-expect-error Custom failure variants still require custom fields.
    const missingLimit: EzRez<number, "DIVIDE_BY_ZERO" | TooBig> = fail({ tag: "TOO_BIG_NUMBER", message: "" });
    void byHelper; void exactTag; void unknownTag; void missingLimit;
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
