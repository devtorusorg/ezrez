import { expect, expectTypeOf, it } from "vitest";
import { define } from "../utils/define.js";
import { fail, isError, isEzRez, isSuccess, ok } from "./index.js";
import type { ErrorOf, ErrorSnapshot, EzFailOf, EzRez, Fail, Ok, Simplified } from "./index.js";

type MathTag = "DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER" | "SOMETHING_ELSE";
type MathFailure = EzFailOf<MathTag>;
type TooBig = EzFailOf<"TOO_BIG_NUMBER"> & { limit: number };
type Mixed = EzRez<number, "DIVIDE_BY_ZERO" | TooBig>;

function divide(a: number, b: number): EzRez<number, MathTag> {
  if (b === 0) return fail({ tag: "DIVIDE_BY_ZERO", message: "Cannot divide by zero" });
  if (a > 100) return fail({ tag: "TOO_BIG_NUMBER", message: "Too big" });
  return ok(a / b);
}

it("distributes tag unions into failure payloads and preserves impossible branches", () => {
  expectTypeOf<EzFailOf<"A">>().toEqualTypeOf<
    Readonly<{
      tag: "A";
      message: string;
      cause: ErrorSnapshot | null;
    }>
  >();
  expectTypeOf<EzFailOf<"A" | "B">>().toEqualTypeOf<EzFailOf<"A"> | EzFailOf<"B">>();
  expectTypeOf<Extract<MathFailure, { tag: "DIVIDE_BY_ZERO" }>>().toEqualTypeOf<
    EzFailOf<"DIVIDE_BY_ZERO">
  >();
  expectTypeOf<EzRez<number, MathTag>>().toEqualTypeOf<EzRez<number, MathFailure>>();
  expectTypeOf<ErrorOf<EzRez<number, MathTag>>>().toEqualTypeOf<MathFailure>();
  expectTypeOf<EzFailOf<never>>().toEqualTypeOf<never>();
  expectTypeOf<EzFailOf<string>["tag"]>().toEqualTypeOf<string>();
  expectTypeOf<EzRez<number>>().toEqualTypeOf<Ok<number>>();
  expectTypeOf<EzRez<number, never>>().toEqualTypeOf<Ok<number>>();
  expectTypeOf<EzRez<number, EzFailOf<never>>>().toEqualTypeOf<Ok<number>>();
  expectTypeOf<EzRez<never, "A">>().toEqualTypeOf<Fail<EzFailOf<"A">>>();
  expectTypeOf<EzRez<never, never>>().toEqualTypeOf<never>();
});

it("works with native inference, explicit annotations, define and branch guards", () => {
  const native = (a: number, b: number) =>
    b === 0 ? fail({ tag: "DIVIDE_BY_ZERO", message: "Cannot divide by zero" }) : ok(a / b);
  const annotated: (a: number, b: number) => EzRez<number, "DIVIDE_BY_ZERO"> = native;
  const wrapped = define(native);
  expectTypeOf<ErrorOf<ReturnType<typeof native>>["tag"]>().toEqualTypeOf<"DIVIDE_BY_ZERO">();
  expectTypeOf(wrapped).returns.toEqualTypeOf<Simplified<ReturnType<typeof native>>>();
  expectTypeOf(wrapped).toExtend<typeof annotated>();
  expectTypeOf(define(divide)).returns.toEqualTypeOf<EzRez<number, MathTag>>();
  expect(wrapped(6, 0)).toEqual(annotated(6, 0));
  const result = divide(6, 0);
  if (isError(result)) expectTypeOf(result.failure).toEqualTypeOf<MathFailure>();
  if (isSuccess(result)) expectTypeOf(result.value).toEqualTypeOf<number>();
  const asyncDivide = async (a: number, b: number): Promise<EzRez<number, MathTag>> => divide(a, b);
  expectTypeOf<ErrorOf<Awaited<ReturnType<typeof asyncDivide>>>>().toEqualTypeOf<MathFailure>();
});

it("preserves custom failure members and narrows mixed unions", () => {
  expectTypeOf<ErrorOf<Mixed>>().toEqualTypeOf<EzFailOf<"DIVIDE_BY_ZERO"> | TooBig>();
  const evaluate = (n: number): Mixed =>
    n > 100
      ? fail({ tag: "TOO_BIG_NUMBER", message: "Too big", limit: 100 })
      : fail({ tag: "DIVIDE_BY_ZERO", message: "Zero" });
  const result = evaluate(101);
  expect(isError(result)).toBe(true);
  if (isError(result)) {
    if (result.failure.tag === "TOO_BIG_NUMBER") {
      expectTypeOf(result.failure.limit).toEqualTypeOf<number>();
      expect(result.failure.limit).toBe(100);
    } else {
      expectTypeOf(result.failure).toEqualTypeOf<EzFailOf<"DIVIDE_BY_ZERO">>();
    }
  }
});

it("requires tag on the wire but preserves unrelated custom type fields", () => {
  expect(isEzRez({ isSuccess: false, failure: { type: "OLD", message: "", cause: null } })).toBe(
    false,
  );
  const error = Object.assign(new Error("native"), { type: "CustomErrorKind" });
  const result = fail({ tag: "NEW", type: "custom-metadata", message: "", cause: error });
  expectTypeOf(result.failure.tag).toEqualTypeOf<"NEW">();
  expect(result.failure.type).toBe("custom-metadata");
  expect(result.failure.cause.details).toEqual({ type: "CustomErrorKind" });
  for (const transported of [JSON.parse(JSON.stringify(result)), structuredClone(result)]) {
    expect(transported).toEqual(result);
    expect(isEzRez(transported)).toBe(true);
  }
});

function invalidFixtures(result: EzRez<number, MathTag>, mixed: Mixed) {
  // @ts-expect-error Only string tags can be expanded.
  type InvalidHelper = EzFailOf<123>;
  // @ts-expect-error Error inputs must be strings or complete failure objects.
  type InvalidResult = EzRez<number, 123>;
  // @ts-expect-error Object variants must include the full base failure structure.
  type Incomplete = EzRez<number, { tag: "A" }>;
  // @ts-expect-error A legacy discriminator is not a tag.
  fail({ type: "OLD", message: "" });
  // @ts-expect-error Tags must be strings.
  fail({ tag: 123, message: "" });
  // @ts-expect-error An unlisted error cannot be returned.
  const wrongTag: EzRez<number, MathTag> = fail({ tag: "UNKNOWN", message: "" });
  // @ts-expect-error Mixed custom variants retain required fields.
  const missingLimit: Mixed = fail({ tag: "TOO_BIG_NUMBER", message: "" });
  // @ts-expect-error Success-only results still cannot fail.
  const noErrors: EzRez<number> = fail({ tag: "A", message: "" });
  if (isError(result)) {
    // @ts-expect-error Tag-only annotations do not promise custom fields.
    result.failure.limit;
    // @ts-expect-error The discriminator was renamed to tag.
    result.failure.type;
  }
  if (isError(mixed) && mixed.failure.tag === "DIVIDE_BY_ZERO") {
    // @ts-expect-error Only the TOO_BIG_NUMBER variant has a limit.
    mixed.failure.limit;
  }
  return [wrongTag, missingLimit, noErrors] as unknown as
    | InvalidHelper
    | InvalidResult
    | Incomplete;
}
void invalidFixtures; // Checked by tsc, not executed.
