import type { AnyResult, ErrorOf, Fail, Ok, SuccessOf } from "../core/types.js";

export type FailureTags<R extends AnyResult> =
  ErrorOf<R> extends infer E ? (E extends { tag: infer Tag extends string } ? Tag : never) : never;

export type FailureForTag<R extends AnyResult, Tag extends string> = Extract<
  ErrorOf<R>,
  { tag: Tag }
>;

export type ErrorHandler<R extends AnyResult, Tag extends FailureTags<R>> = (
  failure: FailureForTag<R, Tag>,
) => unknown;

type HasSuccess<R extends AnyResult> = Extract<R, Ok<unknown>> extends never ? false : true;
type ErrorCases<R extends AnyResult> =
  string extends FailureTags<R> ? never : { [Tag in FailureTags<R>]: ErrorHandler<R, Tag> };

/** Cases for a terminal, finite failure-tag match. */
export type MatchCases<R extends AnyResult> = (HasSuccess<R> extends true
  ? { success: (value: SuccessOf<R>) => unknown }
  : { success?: never }) & { errors: ErrorCases<R> };

export type AsyncMatchCases<R extends AnyResult> = (HasSuccess<R> extends true
  ? { success: (value: SuccessOf<R>) => unknown | PromiseLike<unknown> }
  : { success?: never }) & {
  errors: string extends FailureTags<R>
    ? never
    : {
        [Tag in FailureTags<R>]: (failure: FailureForTag<R, Tag>) => unknown | PromiseLike<unknown>;
      };
};

type ExactKeys<Actual, Shape> = Exclude<keyof Actual, keyof Shape> extends never ? unknown : never;

/** Rejects unknown outer and error-map keys for object literals and typed maps. */
export type ExactMatchCases<R extends AnyResult, Cases extends MatchCases<R>> = ExactKeys<
  Cases,
  MatchCases<R>
> &
  ExactKeys<Cases["errors"], ErrorCases<R>>;

export type MatchOutput<R extends AnyResult, Cases extends MatchCases<R>> =
  | (Cases extends { success: (...args: never[]) => infer Output } ? Output : never)
  | {
      [Tag in FailureTags<R>]: Cases["errors"][Tag] extends (...args: never[]) => infer Output
        ? Output
        : never;
    }[FailureTags<R>];

export type AsyncMatchOutput<R extends AnyResult, Cases extends AsyncMatchCases<R>> = Awaited<
  | (Cases extends { success: (...args: never[]) => infer Output } ? Output : never)
  | {
      [Tag in FailureTags<R>]: Cases["errors"][Tag] extends (...args: never[]) => infer Output
        ? Output
        : never;
    }[FailureTags<R>]
>;

export type { AnyResult, Fail };
