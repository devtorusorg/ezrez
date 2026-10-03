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
const packageDirectory = join(fixtureDirectory, "node_modules", "@devtorusorg/ezrez");

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
        ? 'import * as ez from "@devtorusorg/ezrez"; import * as core from "@devtorusorg/ezrez/core"; import * as utils from "@devtorusorg/ezrez/utils";'
        : 'const ez = require("@devtorusorg/ezrez"), core = require("@devtorusorg/ezrez/core"), utils = require("@devtorusorg/ezrez/utils");';
    execFileSync(
      process.execPath,
      [
        `--input-type=${mode}`,
        "--eval",
        `${imports}
      const result = core.fail("IO", new Error("disk"));
      if (!ez.isError(result) || !ez.isEzRez(result) || result.tag !== "IO" || result.cause.message !== "disk") throw Error("invalid result");
      if (ez.isEzRez({ isSuccess: false, failure: { type: "LEGACY", message: "", cause: null } })) throw Error("legacy result accepted");
      if (!core.isSuccess(ez.ok(1)) || ez.ok(2).value !== 2) throw Error("invalid helper");
      if ("normalizeCause" in core || "ok" in utils) throw Error("invalid entry boundary");
    `,
      ],
      { cwd: fixtureDirectory, stdio: "inherit" },
    );
  }

  const types = `
    import * as ez from "@devtorusorg/ezrez";
    import { ok, fail, isError, type EzRez, type EzFailOf, type ErrorOf } from "@devtorusorg/ezrez/core";
    import { normalizeCause } from "@devtorusorg/ezrez/utils";
    const fn = (flag: boolean) => flag ? ok(1) : fail("IO", new Error());
    type E = ErrorOf<ReturnType<typeof fn>>;
    const normalized: (flag: boolean) => EzRez<number, "IO"> = fn;
    const result = normalized(false);
    if (isError(result)) { const tag: "IO" = result.tag; void tag; }
    const onlyOk: EzRez<number, never> = ez.ok(1);
    // @ts-expect-error No failure branch exists in a success-only result.
    const invalid: EzRez<number> = fail({ tag: "NO" });
    const nativeCause = fail("NO", new Error());
    const snapshotName: string = nativeCause.cause.name;
    void snapshotName;
    // @ts-expect-error No arbitrary application validator generic is accepted.
    ez.isEzRez<EzRez<number>>(result);
    void onlyOk; void invalid;

    type MathTag = "DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER";
    type MathFailure = EzFailOf<MathTag>;
    const divide = (a: number, b: number) => b === 0
      ? fail("DIVIDE_BY_ZERO")
      : a > 100 ? fail("TOO_BIG_NUMBER") : ok(a / b);
    const byHelper: (a: number, b: number) => ez.EzRez<number, ez.EzFailOf<MathTag>> = divide;
    const exactTag: Extract<MathFailure, { tag: "DIVIDE_BY_ZERO" }> = {
      tag: "DIVIDE_BY_ZERO",
      cause: { name: "Error", message: "DIVIDE_BY_ZERO", cause: null },
    };
    // @ts-expect-error A tag shorthand cannot accept unrelated tags.
    const unknownTag: EzRez<number, MathTag> = fail({ tag: "OTHER" });
    // @ts-expect-error Legacy constructor inputs are rejected.
    fail({ type: "OLD" });
    // @ts-expect-error Failure envelopes accept no custom top-level fields.
    fail({ tag: "CUSTOM", limit: 100 });
    void byHelper; void exactTag; void unknownTag;
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
