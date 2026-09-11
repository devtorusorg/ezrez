import type { AnyResult, ErrorOf, EzRez, Failure, Prettify, SuccessOf } from "../core/types.js";

type ErrorTags<R extends AnyResult> = ErrorOf<R> extends infer E extends Failure ? E["tag"] : never;
type SimplifiedErrors<R extends AnyResult> =
  ErrorOf<R> extends infer E extends Failure
    ? [Exclude<keyof E, keyof Failure>] extends [never]
      ? ErrorTags<R>
      : Prettify<E>
    : never;

/**
 * Optional return-type normalization for ordinary synchronous result functions.
 * Identity at runtime: does not catch exceptions, wrap calls or transform results.
 * Generic, overloaded and explicit-this signatures should use native inference.
 */
export function define<A extends unknown[], R extends AnyResult>(
  callback: (...args: A) => R,
): (...args: A) => EzRez<SuccessOf<R>, SimplifiedErrors<R>> {
  // The implementation is identity; Simplified only changes the public type.
  // TS cannot prove this relationship for a still-generic conditional type.
  return callback as unknown as (...args: A) => EzRez<SuccessOf<R>, SimplifiedErrors<R>>;
}
