import { describe, expect, it } from "vitest";
import * as api from "./index.js";
import * as core from "./core/index.js";
import * as utils from "./utils/index.js";

describe("public API", () => {
  it("re-exports named functions without a runtime API object", () => {
    expect(Object.keys(core).sort()).toEqual(["fail", "isError", "isEzRez", "isSuccess", "ok"]);
    expect(Object.keys(utils).sort()).toEqual(["normalizeCause"]);
    expect(Object.keys(api).sort()).toEqual([...Object.keys(core), ...Object.keys(utils)].sort());
    expect(api.ok).toBe(core.ok);
  });
});
