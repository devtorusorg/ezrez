import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
// Keep fixtures inside the package so package self-references use its export map.
const directory = mkdtempSync(join(projectRoot, ".tree-shaking-"));

async function bundle(name, source) {
  const entry = join(directory, `${name}.js`);
  writeFileSync(entry, source);
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "esm",
    minify: true,
    write: false,
  });
  assert(result.success, result.logs.map(String).join("\n"));
  assert.equal(result.outputs.length, 1);
  return result.outputs[0].text();
}

try {
  for (const entry of ["ezrez", "ezrez/core"]) {
    for (const style of ["named", "namespace"]) {
      const source =
        style === "named"
          ? `import { ok, fail } from "${entry}"; export { ok, fail };`
          : `import * as ez from "${entry}"; export const success = ez.ok; export const failure = ez.fail;`;
      const output = await bundle(`${entry.replaceAll("/", "-")}-${style}`, source);
      assert(!output.includes("NormalizationError"), "unused cause normalization retained");
      assert(!output.includes("getOwnPropertyDescriptor"), "unused validation retained");
      assert(
        !output.includes("normalizeCause") && !output.includes("define"),
        "unused helpers retained",
      );
      // Baseline ~150 bytes; allow modest changes without accepting accidental helper inclusion.
      assert(
        Buffer.byteLength(output) < 512,
        `constructor-only bundle grew to ${Buffer.byteLength(output)} bytes`,
      );
      console.log(`${entry} (${style}): ${Buffer.byteLength(output)} bytes`);
    }
  }
  for (const entry of ["ezrez", "ezrez/utils"]) {
    const output = await bundle(
      `used-${entry.replaceAll("/", "-")}`,
      `import * as ez from "${entry}"; export const normalize = ez.normalizeCause;`,
    );
    assert(output.includes("NormalizationError"), "used normalization was incorrectly removed");
    assert(
      Buffer.byteLength(output) < 12_000,
      "normalization bundle unexpectedly grew beyond 12 KB",
    );
    console.log(`${entry} (used normalization): ${Buffer.byteLength(output)} bytes`);
  }
  console.log("Browser ESM named/namespace tree-shaking checks passed.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
