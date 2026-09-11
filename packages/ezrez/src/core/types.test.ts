import { expectTypeOf, it } from "vitest";
import type {
  AnyResult,
  ErrorOf,
  EzFailOf,
  EzRez,
  FailureInput,
  Normalize,
  Ok,
  SuccessOf,
  WithCause,
} from "./types.js";

// Ambient prototypes exercise inference before the runtime implementation exists.
declare function prototypeOk<S>(value: S): Ok<S>;
declare function prototypeFail<const F extends FailureInput>(failure: F): WithCause<F>;
declare function prototypeDefine<A extends unknown[], R extends AnyResult>(
  callback: (...args: A) => R,
): (...args: A) => Normalize<R>;
declare function prototypeDefine<A extends unknown[], R extends AnyResult>(
  callback: (...args: A) => Promise<R>,
): (...args: A) => Promise<Normalize<Awaited<R>>>;

function fixtures() {
  const native = (mode: number) => {
    if (mode === 0) return prototypeOk(1);
    if (mode === 1) return prototypeOk("value");
    if (mode === 2) return prototypeFail({ tag: "MISSING" });
    return prototypeFail({ tag: "INVALID" });
  };
  type R = ReturnType<typeof native>;
  expectTypeOf<SuccessOf<R>>().toEqualTypeOf<number | string>();
  expectTypeOf<ErrorOf<R>["tag"]>().toEqualTypeOf<"MISSING" | "INVALID">();
  expectTypeOf<R>().toExtend<EzRez<number | string, ErrorOf<R>>>();
  const normalized = prototypeDefine(native);
  expectTypeOf(normalized).returns.toEqualTypeOf<EzRez<number | string, ErrorOf<R>>>();
  expectTypeOf(prototypeDefine(() => prototypeOk(1))).returns.toEqualTypeOf<EzRez<number>>();
  // @ts-expect-error Plain values are not results.
  prototypeDefine(() => 1);
  expectTypeOf(prototypeDefine(async () => prototypeOk(1))).returns.toEqualTypeOf<
    Promise<EzRez<number>>
  >();
}
void fixtures; // Typechecked by tsc; ambient prototypes are never executed.

it("models impossible branches and distributes extraction", () => {
  expectTypeOf<EzRez<number>>().toEqualTypeOf<Ok<number>>();
  expectTypeOf<ErrorOf<EzRez<number>>>().toEqualTypeOf<never>();
  expectTypeOf<EzRez<never, never>>().toEqualTypeOf<never>();
  type E = EzFailOf<"ERROR">;
  expectTypeOf<EzRez<never, E>>().toEqualTypeOf<E>();
  expectTypeOf<SuccessOf<E>>().toEqualTypeOf<never>();
});
