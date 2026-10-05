import { isSuccess } from "../core/guards.js";
import type { AnyResult, Ok, SuccessOf } from "../core/types.js";

type WithSuccess<R extends AnyResult> = Extract<R, Ok<unknown>> extends never ? never : R;

/**
 * Returns the success value, or a fallback for a failure.
 *
 * @typeParam R - Result union containing at least one success branch.
 * @param result - Result to unwrap.
 * @param fallback - Value assignable to the result's success payload.
 * @returns The success value or `fallback`.
 */
export function getOr<R extends AnyResult>(
  result: WithSuccess<R>,
  fallback: NoInfer<SuccessOf<R>>,
): SuccessOf<R> {
  return (isSuccess(result) ? result.value : fallback) as SuccessOf<R>;
}
