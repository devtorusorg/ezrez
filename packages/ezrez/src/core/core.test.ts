import { describe, expect, expectTypeOf, it } from "vitest";
import { fail, isError, isEzRez, isSuccess, ok } from "./index.js";
import type { ErrorOf, ErrorSnapshot, EzRez, SuccessOf } from "./index.js";

const load = (mode: number) => {
  if (mode === 0) return ok({ id: "user" });
  if (mode === 1) return ok(123);
  if (mode === 2) return fail({ tag: "MISSING" });
  return fail({ tag: "INVALID" });
};

describe("core", () => {
  it("creates exact failures from shorthand, descriptors and native Errors", () => {
    expect(ok(undefined)).toEqual({ tag: "success", value: undefined });
    const input = { tag: "ERROR" } as const;
    const result = fail(input);
    expect(result).toEqual({
      tag: "ERROR",
      cause: { name: "Error", message: "ERROR", cause: null },
    });
    expect(result).not.toBe(input);
    expect(fail("ERROR")).toEqual(result);
    expect(fail({ tag: "E", cause: undefined }).cause).toEqual({
      name: "Error",
      message: "E",
      cause: null,
    });

    const described = fail("INVALID", {
      name: undefined,
      message: "Invalid input",
      cause: new TypeError("root"),
      context: { field: "email" },
    });
    expect(described).toEqual({
      tag: "INVALID",
      cause: {
        name: "Error",
        message: "Invalid input",
        cause: { name: "TypeError", message: "root", stack: expect.any(String), cause: null },
        context: { field: "email" },
      },
    });
    const inline = fail({ tag: "INLINE", name: "DomainError", message: "inline" });
    expect(inline.cause).toEqual({ name: "DomainError", message: "inline", cause: null });

    const native = new TypeError("native");
    const nativeFailure = fail("E", native);
    expect(nativeFailure.cause).toMatchObject({ name: "TypeError", message: "native" });
    expect(nativeFailure.cause).not.toBe(native);
    expectTypeOf(nativeFailure.cause).toEqualTypeOf<ErrorSnapshot>();
    const unsupported = { tag: "E", limit: 1 } as unknown as { tag: "E" };
    expect(() => fail(unsupported)).toThrow("Failure descriptor contains unsupported fields");
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.isFrozen(result)).toBe(false);
  });

  it("infers payloads, tags, never errors and exact narrowed branches", () => {
    type R = ReturnType<typeof load>;
    expectTypeOf<SuccessOf<R>>().toEqualTypeOf<{ id: string } | number>();
    expectTypeOf<ErrorOf<R>["tag"]>().toEqualTypeOf<"MISSING" | "INVALID">();
    const result: EzRez<SuccessOf<R>, ErrorOf<R>> = load(2);
    expect(isEzRez(result)).toBe(true);
    const branch = load(2);
    if (isError(branch)) {
      expectTypeOf(branch).toEqualTypeOf<Extract<R, { cause: unknown }>>();
      expectTypeOf(branch.cause).toEqualTypeOf<ErrorSnapshot>();
    }
    if (isSuccess(branch)) expectTypeOf(branch.value).toEqualTypeOf<{ id: string } | number>();
    const direct = load(0);
    if (direct.tag === "success") {
      expectTypeOf(direct.value).toEqualTypeOf<{ id: string } | number>();
    } else if (direct.tag === "MISSING") {
      expectTypeOf(direct.cause).toEqualTypeOf<ErrorSnapshot>();
    }
    const success = ok({ count: 1 });
    success.value.count = 2; // Success payloads are not inferred deeply readonly.
    expectTypeOf<ErrorOf<typeof success>>().toEqualTypeOf<never>();
    const failure = fail({ tag: "E" });
    expectTypeOf<SuccessOf<typeof failure>>().toEqualTypeOf<never>();
    const nativeAsync = async () => ok(1);
    expectTypeOf<ErrorOf<Awaited<ReturnType<typeof nativeAsync>>>>().toEqualTypeOf<never>();
  });

  it("rejects reserved tags and unsupported descriptor fields", () => {
    const reservedTag: string = "success";
    expect(() => fail(reservedTag)).toThrow('Failure tag "success" is reserved');
    expect(() => fail({ tag: reservedTag })).toThrow('Failure tag "success" is reserved');
    const unsupported = { tag: "E", limit: 1 } as unknown as { tag: "E" };
    expect(() => fail(unsupported)).toThrow("Failure descriptor contains unsupported fields");
  });
  it("validates exact structural boundaries without invoking getters", () => {
    for (const value of [ok(1), ok(() => 1), fail({ tag: "E" })]) expect(isEzRez(value)).toBe(true);
    const invalid: unknown[] = [
      null,
      1,
      [],
      {},
      { tag: "success" },
      { tag: "success", value: 1, cause: undefined },
      { tag: "E" },
      { tag: 1, cause: null },
      { tag: "E", value: undefined, cause: null },
      { tag: "E", message: "old", cause: null },
      { tag: "E", cause: null, failure: { cause: null } },
      {
        get tag() {
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

  it("rejects malformed or cyclic snapshots and non-JSON context", () => {
    const validate = (cause: unknown) => isEzRez({ tag: "E", cause });
    expect(validate({ name: "Error", message: "", cause: null, context: { a: [1, null] } })).toBe(
      true,
    );
    for (const cause of [
      new Error("x"),
      { name: "E", message: "" },
      { name: "E", message: "", cause: null, context: { x: Infinity } },
      { name: "E", message: "", cause: null, context: { x: () => 1 } },
      { name: "E", message: "", cause: null, context: new Date() },
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
