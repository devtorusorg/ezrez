import { expect, expectTypeOf, it } from "vitest";
import { fail, isError, isEzRez, isSuccess, ok } from "./index.js";
import type { ErrorOf, ErrorSnapshot, EzFailOf, EzRez, Fail, Ok } from "./index.js";

type MathTag = "DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER" | "SOMETHING_ELSE";
type MathFailure = EzFailOf<MathTag>;

function divide(a: number, b: number): EzRez<number, MathTag> {
  if (b === 0) return fail({ tag: "DIVIDE_BY_ZERO" });
  if (a > 100) return fail({ tag: "TOO_BIG_NUMBER" });
  return ok(a / b);
}

it("distributes tag unions into failure payloads and preserves impossible branches", () => {
  expectTypeOf<EzFailOf<"A">>().toEqualTypeOf<
    Readonly<{
      tag: "A";
      cause: ErrorSnapshot;
      value?: never;
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
  expectTypeOf<EzRez<never, "A">>().toEqualTypeOf<Fail<"A">>();
  expectTypeOf<EzRez<never, never>>().toEqualTypeOf<never>();
});

it("works with native inference, explicit annotations and branch guards", () => {
  const native = (a: number, b: number) => (b === 0 ? fail({ tag: "DIVIDE_BY_ZERO" }) : ok(a / b));
  const annotated: (a: number, b: number) => EzRez<number, "DIVIDE_BY_ZERO"> = native;
  expectTypeOf<ErrorOf<ReturnType<typeof native>>["tag"]>().toEqualTypeOf<"DIVIDE_BY_ZERO">();
  expectTypeOf(native).toExtend<typeof annotated>();
  expect(native(6, 0)).toEqual(annotated(6, 0));
  const result = divide(6, 0);
  if (isError(result)) expectTypeOf(result.cause).toEqualTypeOf<ErrorSnapshot>();
  if (isSuccess(result)) expectTypeOf(result.value).toEqualTypeOf<number>();
  const asyncDivide = async (a: number, b: number): Promise<EzRez<number, MathTag>> => divide(a, b);
  expectTypeOf<ErrorOf<Awaited<ReturnType<typeof asyncDivide>>>>().toEqualTypeOf<MathFailure>();
});

it("keeps diagnostic context owned by the normalized native error", () => {
  expect(isEzRez({ tag: "OLD", type: "OLD", cause: null })).toBe(false);
  const error = Object.assign(new Error("native"), { type: "CustomErrorKind" });
  const result = fail("NEW", error);
  expectTypeOf(result.tag).toEqualTypeOf<"NEW">();
  expectTypeOf(result.cause.context.type).toEqualTypeOf<string>();
  expect(result.cause.context).toEqual({ type: "CustomErrorKind" });
  for (const transported of [JSON.parse(JSON.stringify(result)), structuredClone(result)]) {
    expect(transported).toEqual(result);
    expect(isEzRez(transported)).toBe(true);
  }
});

it("keeps descriptor context correlated with its failure tag", () => {
  const parsePort = (input: string) => {
    if (!Number.isInteger(Number(input))) return fail("INVALID_PORT", { context: { input } });
    return ok(Number(input));
  };
  const result = parsePort("bad");
  if (isError(result) && result.tag === "INVALID_PORT") {
    expectTypeOf(result.cause.context.input).toEqualTypeOf<string>();
    expect(result.cause.context.input).toBe("bad");
  }
});

function invalidFixtures(result: EzRez<number, MathTag>) {
  // @ts-expect-error Only string tags can be expanded.
  type InvalidHelper = EzFailOf<123>;
  // @ts-expect-error Error inputs must be strings or complete failure objects.
  type InvalidResult = EzRez<number, 123>;
  // @ts-expect-error Object variants must include the normalized cause.
  type Incomplete = EzRez<number, { tag: "A" }>;
  // @ts-expect-error A legacy discriminator is not a tag.
  fail({ type: "OLD" });
  // @ts-expect-error Descriptors accept only Error fields.
  fail("OLD", { message: "legacy", extra: true });
  // @ts-expect-error The success tag is reserved.
  fail({ tag: "success" });
  // @ts-expect-error Tags must be strings.
  fail({ tag: 123 });
  // @ts-expect-error An unlisted error cannot be returned.
  const wrongTag: EzRez<number, MathTag> = fail({ tag: "UNKNOWN" });
  // @ts-expect-error Failure envelopes accept no custom top-level fields.
  fail({ tag: "TOO_BIG_NUMBER", limit: 100 });
  // @ts-expect-error Success-only results still cannot fail.
  const noErrors: EzRez<number> = fail({ tag: "A" });
  if (isError(result)) {
    // @ts-expect-error Failure envelopes contain no custom top-level fields.
    result.limit;
    // @ts-expect-error The obsolete failure container is not present.
    result.failure;
  }
  return [wrongTag, noErrors] as unknown as InvalidHelper | InvalidResult | Incomplete;
}
void invalidFixtures; // Checked by tsc, not executed.
