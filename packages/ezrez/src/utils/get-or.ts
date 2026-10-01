import { isSuccess } from "../core/guards.js";
import type { AnyResult, Ok, SuccessOf } from "../core/types.js";

type WithSuccess<R extends AnyResult> = Extract<R, Ok<unknown>> extends never ? never : R;

/** Returns the success value, or a same-type fallback for a failure. */
export function getOr<R extends AnyResult>(
  result: WithSuccess<R>,
  fallback: NoInfer<SuccessOf<R>>,
): SuccessOf<R> {
  return (isSuccess(result) ? result.value : fallback) as SuccessOf<R>;
}
