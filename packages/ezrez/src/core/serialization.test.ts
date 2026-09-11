import { expect, it } from "vitest";
import { fail, isEzRez, ok } from "./index.js";

it("round-trips supported success payloads and failure custom fields", () => {
  const results = [
    ok(null),
    ok({ id: "u", values: [1, true, "x", null] }),
    fail({ type: "MISSING", message: "Missing", data: { id: "u" } }),
  ];
  for (const result of results) {
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(structuredClone(result)).toEqual(result);
    expect(isEzRez(JSON.parse(JSON.stringify(result)))).toBe(true);
  }
});

it("leaves unrestricted success payloads untouched rather than promising universal serialization", () => {
  const fn = () => 1;
  expect(ok(fn).value).toBe(fn);
  expect(() => structuredClone(ok(fn))).toThrow();
  expect(() => JSON.stringify(ok(1n))).toThrow();
  // JSON drops undefined-valued object fields; clone preserves them.
  expect(JSON.parse(JSON.stringify(ok(undefined)))).toEqual({ isSuccess: true });
  expect(isEzRez(JSON.parse(JSON.stringify(ok(undefined))))).toBe(false);
  expect(structuredClone(ok(undefined))).toEqual(ok(undefined));
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  expect(() => JSON.stringify(ok(cyclic))).toThrow();
  expect(structuredClone(ok(cyclic)).value.self).toBeDefined();
});

it("rejects cyclic JSON details without rejecting repeated references", () => {
  const shared = { value: 1 };
  const wrap = (details: unknown) => ({
    isSuccess: false,
    failure: {
      type: "E",
      message: "",
      cause: { name: "Error", message: "", cause: null, details },
    },
  });
  expect(isEzRez(wrap({ first: shared, second: shared }))).toBe(true);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expect(isEzRez(wrap(cyclic))).toBe(false);
  expect(isEzRez(wrap({ sparse: new Array(2) }))).toBe(false);
  expect(
    isEzRez(
      wrap({
        get field() {
          throw new Error("never execute");
        },
      }),
    ),
  ).toBe(false);
});
