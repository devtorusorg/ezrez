import { describe, expect, expectTypeOf, it } from "vitest";
import { fail, isError, isEzRez, isSuccess, ok } from "./index.js";
import type { ErrorOf, EzRez, SuccessOf } from "./index.js";

const load = (mode: number) => {
  if (mode === 0) return ok({ id: "user" });
  if (mode === 1) return ok(123);
  if (mode === 2) return fail({ type: "MISSING", message: "Missing", id: "user" });
  return fail({ type: "INVALID", message: "Invalid", reason: 1 });
};

describe("core", () => {
  it("creates plain branch-only results and fills missing causes", () => {
    expect(ok(undefined)).toEqual({ isSuccess: true, value: undefined });
    const input = { type: "ERROR", message: "Oops", extra: { value: 1 } };
    const result = fail(input);
    expect(result).toEqual({ isSuccess: false, failure: { ...input, cause: null } });
    expect(result.failure).not.toBe(input);
    expect(result.failure.extra).toBe(input.extra);
    expect(fail({ type: "E", message: "", cause: undefined }).failure.cause).toBeNull();
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.isFrozen(result)).toBe(false);
  });

  it("infers payloads, tags, never errors and exact narrowed branches", () => {
    type R = ReturnType<typeof load>;
    expectTypeOf<SuccessOf<R>>().toEqualTypeOf<{ id: string } | number>();
    expectTypeOf<ErrorOf<R>["type"]>().toEqualTypeOf<"MISSING" | "INVALID">();
    const result: EzRez<SuccessOf<R>, ErrorOf<R>> = load(2);
    expect(isEzRez(result)).toBe(true);
    const branch = load(2);
    if (isError(branch)) {
      expectTypeOf(branch).toEqualTypeOf<Extract<R, { isSuccess: false }>>();
      if (branch.failure.type === "MISSING")
        expectTypeOf(branch.failure.id).toEqualTypeOf<"user">();
    }
    if (isSuccess(branch)) expectTypeOf(branch.value).toEqualTypeOf<{ id: string } | number>();
    const success = ok({ count: 1 });
    success.value.count = 2; // Success payloads are not inferred deeply readonly.
    expectTypeOf<ErrorOf<typeof success>>().toEqualTypeOf<never>();
    const failure = fail({ type: "E", message: "" });
    expectTypeOf<SuccessOf<typeof failure>>().toEqualTypeOf<never>();
    const nativeAsync = async () => ok(1);
    expectTypeOf<ErrorOf<Awaited<ReturnType<typeof nativeAsync>>>>().toEqualTypeOf<never>();
  });

  it("preserves annotated custom failure unions", () => {
    type E =
      | { type: "A"; message: string; cause: null; a: number }
      | { type: "B"; message: string; cause: null; b: string };
    const fromUnion = (error: E) => fail(error);
    expectTypeOf<ErrorOf<ReturnType<typeof fromUnion>>>().toExtend<E>();
    expectTypeOf(fail({ type: "X", message: "" }).failure.cause).toEqualTypeOf<null>();
  });

  it("validates structural boundaries without invoking getters", () => {
    for (const value of [ok(1), ok(() => 1), fail({ type: "E", message: "" })])
      expect(isEzRez(value)).toBe(true);
    const invalid: unknown[] = [
      null,
      1,
      [],
      {},
      { isSuccess: true },
      { isSuccess: true, value: 1, failure: undefined },
      { isSuccess: false, failure: { type: "E", message: "" } },
      { isSuccess: false, failure: { type: 1, message: "", cause: null } },
      { isSuccess: false, value: undefined, failure: { type: "E", message: "", cause: null } },
      {
        get isSuccess() {
          throw new Error("getter");
        },
      },
      new Proxy(
        {},
        {
          getOwnPropertyDescriptor() {
            throw new Error("proxy");
          },
        },
      ),
    ];
    for (const value of invalid) expect(isEzRez(value)).toBe(false);
  });

  it("rejects malformed or cyclic snapshots and non-JSON details", () => {
    const validate = (cause: unknown) =>
      isEzRez({ isSuccess: false, failure: { type: "E", message: "", cause } });
    expect(validate({ name: "Error", message: "", cause: null, details: { a: [1, null] } })).toBe(
      true,
    );
    for (const cause of [
      new Error("x"),
      { name: "E", message: "" },
      { name: "E", message: "", cause: null, details: { x: Infinity } },
      { name: "E", message: "", cause: null, details: { x: () => 1 } },
      { name: "E", message: "", cause: null, details: new Date() },
    ])
      expect(validate(cause)).toBe(false);
    const cyclic: { name: string; message: string; cause: unknown } = {
      name: "E",
      message: "",
      cause: null,
    };
    cyclic.cause = cyclic;
    expect(validate(cyclic)).toBe(false);
  });
});
