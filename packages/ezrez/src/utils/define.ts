import type { AnyResult, ErrorOf, EzRez, SuccessOf } from "../core/types.js";

type SimplifiedErrors<R extends AnyResult> =
  ErrorOf<R> extends infer E extends { tag: string; cause: unknown }
    ? [Exclude<keyof E, "tag" | "cause" | "value">] extends [never]
      ? E["tag"]
      : E
    : never;

/**
 * Optional return-type normalization for synchronous or Promise-returning result functions.
 * Identity at runtime: does not catch exceptions, handle promises or transform results.
 * Generic, overloaded and explicit-this signatures should use native inference.
 */
export function define<A extends unknown[], R extends AnyResult>(
  callback: (...args: A) => R,
): (...args: A) => EzRez<SuccessOf<R>, SimplifiedErrors<R>>;
export function define<A extends unknown[], R extends AnyResult>(
  callback: (...args: A) => Promise<R>,
): (...args: A) => Promise<EzRez<SuccessOf<R>, SimplifiedErrors<R>>>;
export function define(callback: (...args: never[]) => unknown): (...args: never[]) => unknown {
  // The implementation is identity; normalization only changes the public type.
  return callback;
}
