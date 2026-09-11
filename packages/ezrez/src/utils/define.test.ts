import { expect, expectTypeOf, it } from "vitest";
import { fail, ok } from "../core/index.js";
import type { EzRez } from "../core/types.js";
import { define } from "./define.js";

it("returns the callback unchanged and normalizes its public signature", () => {
  const callback = (id: string, count = 1, ...flags: boolean[]) => {
    if (!id) return fail({ tag: "INVALID" });
    return ok({ id, count, flags });
  };
  const fn = define(callback);
  expect(fn).toBe(callback);
  expect(fn("id")).toEqual(ok({ id: "id", count: 1, flags: [] }));
  expectTypeOf(fn).parameters.toEqualTypeOf<[id: string, count?: number, ...flags: boolean[]]>();
  expectTypeOf(fn).returns.toEqualTypeOf<
    EzRez<{ id: string; count: number; flags: boolean[] }, "INVALID">
  >();
  expectTypeOf(define(() => ok(1))).returns.toEqualTypeOf<EzRez<number>>();
  const onlyFailure = () => fail({ tag: "E" });
  expectTypeOf(define(onlyFailure)).returns.toEqualTypeOf<EzRez<never, "E">>();
});
it("normalizes async result callbacks without wrapping them", async () => {
  const callback = async (id: string, count = 1, ...flags: boolean[]) => {
    if (!id) return fail({ tag: "INVALID_ID" });
    return ok({ id, count, flags });
  };
  const fn = define(callback);
  expect(fn).toBe(callback);
  expectTypeOf(fn).parameters.toEqualTypeOf<[id: string, count?: number, ...flags: boolean[]]>();
  expectTypeOf(fn).returns.toEqualTypeOf<
    Promise<EzRez<{ id: string; count: number; flags: boolean[] }, "INVALID_ID">>
  >();
  await expect(fn("id", 2, true)).resolves.toEqual(ok({ id: "id", count: 2, flags: [true] }));
  await expect(fn("")).resolves.toEqual(fail({ tag: "INVALID_ID" }));
});

it("does not catch or transform rejected promises", async () => {
  const error = new Error("unchanged");
  const callback = async () => {
    throw error;
  };
  const fn = define(callback);
  expect(fn).toBe(callback);
  await expect(fn()).rejects.toBe(error);
});

it("does not catch or transform exceptions", () => {
  const error = new Error("unchanged");
  const fn = define(() => {
    throw error;
  });
  expect(() => fn()).toThrow(error);
  expectTypeOf(fn).returns.toEqualTypeOf<never>();
});

function invalidFixtures() {
  // @ts-expect-error Non-results are not accepted.
  define(() => 1);
  define(async () => ok(1));
  // @ts-expect-error Every returning branch must be a result.
  define((flag: boolean) => (flag ? ok(1) : undefined));
}
void invalidFixtures;
