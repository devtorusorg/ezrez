import type { AnyResult, Normalize } from "../core/types.js";

/**
 * Optional return-type normalization for ordinary synchronous result functions.
 * Identity at runtime: does not catch exceptions, wrap calls or transform results.
 * Generic, overloaded and explicit-this signatures should use native inference.
 */
export function define<A extends unknown[], R extends AnyResult>(
  callback: (...args: A) => R,
): (...args: A) => Normalize<R> {
  // Every branch in R belongs to the union reconstructed by Normalize<R>.
  // TS cannot prove this relationship for a still-generic conditional type.
  return callback as unknown as (...args: A) => Normalize<R>;
}
