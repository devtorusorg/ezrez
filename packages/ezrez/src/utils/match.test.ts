import { expect, expectTypeOf, it } from "vitest";
import { fail, ok, type EzRez } from "../core/index.js";
import {
  catchAllTags,
  catchTag,
  getOr,
  match,
  matchAsync,
  recover,
  recoverAsync,
} from "./index.js";

const divide = (a: number, b: number) => {
  if (b === 0) return fail("DIVIDE_BY_ZERO", { context: { a, b } });
  if (a > 100) return fail("TOO_LARGE");
  return ok(a / b);
};

type Division = ReturnType<typeof divide>;

it("matches every result branch with correlated failures", () => {
  const result = match(divide(1, 0), {
    success: (value) => `ok:${value}`,
    errors: {
      DIVIDE_BY_ZERO: (failure) => {
        expectTypeOf(failure.cause.context.a).toEqualTypeOf<number>();
        return failure.cause.context.b;
      },
      TOO_LARGE: () => "large",
    },
  });
  expect(result).toBe(0);
});

it("recovers matching failures and leaves partial failures", () => {
  const recovered = recover(
    divide(1, 0),
    catchAllTags<Division>()({
      DIVIDE_BY_ZERO: () => ok(0),
      TOO_LARGE: () => ok(100),
    }),
  );
  expect(getOr(recovered, 1)).toBe(0);

  const partial = recover(
    divide(101, 1),
    catchTag("DIVIDE_BY_ZERO", () => ok(0)),
  );
  expect(partial).toMatchObject({ tag: "TOO_LARGE" });
});

it("uses handler maps without confusing inherited or special object keys", () => {
  const catcher = catchTag("DIVIDE_BY_ZERO", () => ok(0));
  expect(catcher).toEqual({ handlers: { DIVIDE_BY_ZERO: catcher.handlers.DIVIDE_BY_ZERO } });
  expect("kind" in catcher).toBe(false);

  const inheritedName = fail("toString");
  expect(recover(inheritedName, catcher)).toBe(inheritedName);
  expect(
    recover(
      fail("__proto__"),
      catchTag("__proto__", () => ok(1)),
    ),
  ).toEqual(ok(1));
});

it("has reusable typed catchers and always-Promise async runners", async () => {
  const catcher = catchTag<Division>()("DIVIDE_BY_ZERO", (failure) => {
    expectTypeOf(failure.cause.context.b).toEqualTypeOf<number>();
    return ok(failure.cause.context.a);
  });
  expect(getOr(recover(catcher)(divide(2, 0)), 0)).toBe(2);
  expect(getOr(await recoverAsync(Promise.resolve(divide(3, 0)), catcher), 0)).toBe(3);
  await expect(
    matchAsync(Promise.resolve(divide(1, 0)), {
      success: (value) => value,
      errors: { DIVIDE_BY_ZERO: async () => 0, TOO_LARGE: () => 1 },
    }),
  ).resolves.toBe(0);
});

it("rejects impossible synchronous operations", () => {
  const onlyFailure: EzRez<never, "NO"> = fail("NO");
  // @ts-expect-error A failure-only result has no value type to fall back to.
  getOr(onlyFailure, 0);
  // @ts-expect-error Promise-returning catchers belong to recoverAsync.
  recover(
    divide(1, 0),
    catchTag("DIVIDE_BY_ZERO", async () => ok(0)),
  );
});
