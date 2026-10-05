import { isSuccess } from "../core/guards.js";
import type { AnyResult } from "../core/types.js";
import type {
  AsyncMatchCases,
  AsyncMatchOutput,
  ExactMatchCases,
  MatchCases,
  MatchOutput,
} from "./types.js";

/**
 * Exhaustively consumes a finite result branch union.
 *
 * It supports direct and curried forms. Every possible failure tag needs a correlated handler.
 *
 * @param result - Result to consume, when using the direct form.
 * @param cases - Success and failure handlers.
 * @returns The union of handler return values.
 *
 * @example
 * ```ts
 * const message = match(fail("NOT_FOUND"), {
 *   errors: { NOT_FOUND: () => "Missing" },
 * });
 * ```
 */
export function match<R extends AnyResult, const Cases extends MatchCases<R>>(
  result: R,
  cases: Cases & ExactMatchCases<R, Cases>,
): MatchOutput<R, Cases>;
export function match<R extends AnyResult>(): <const Cases extends MatchCases<R>>(
  cases: Cases & ExactMatchCases<R, Cases>,
) => (result: R) => MatchOutput<R, Cases>;
export function match(result?: unknown, cases?: unknown): unknown {
  const apply = (value: AnyResult, cases: MatchCases<AnyResult>): unknown => {
    if (isSuccess(value)) {
      if (!cases.success) throw new TypeError("Match has no success case");
      return cases.success(value.value);
    }
    const handler = (cases.errors as Record<string, (failure: never) => unknown>)[value.tag];
    if (!handler)
      throw new TypeError(`Match has no case for failure tag ${JSON.stringify(value.tag)}`);
    return handler(value as never);
  };
  if (result === undefined)
    return (nextCases: MatchCases<AnyResult>) => (value: AnyResult) => apply(value, nextCases);
  return apply(result as AnyResult, cases as MatchCases<AnyResult>);
}

/**
 * Asynchronously exhaustively consumes a result or promised result.
 *
 * @returns A promise of the union of awaited handler return values.
 */
export function matchAsync<R extends AnyResult, const Cases extends AsyncMatchCases<R>>(
  result: R | PromiseLike<R>,
  cases: Cases,
): Promise<AsyncMatchOutput<R, Cases>>;
export function matchAsync<R extends AnyResult>(): <const Cases extends AsyncMatchCases<R>>(
  cases: Cases,
) => (result: R | PromiseLike<R>) => Promise<AsyncMatchOutput<R, Cases>>;
export function matchAsync(result?: unknown, cases?: unknown): unknown {
  const apply = async (
    input: AnyResult | PromiseLike<AnyResult>,
    cases: AsyncMatchCases<AnyResult>,
  ) => {
    const value = await input;
    if (isSuccess(value)) {
      if (!cases.success) throw new TypeError("Match has no success case");
      return await cases.success(value.value);
    }
    const handler = (cases.errors as Record<string, (failure: never) => unknown>)[value.tag];
    if (!handler)
      throw new TypeError(`Match has no case for failure tag ${JSON.stringify(value.tag)}`);
    return await handler(value as never);
  };
  if (result === undefined)
    return (nextCases: AsyncMatchCases<AnyResult>) => (value: AnyResult | PromiseLike<AnyResult>) =>
      apply(value, nextCases);
  return apply(result as AnyResult, cases as AsyncMatchCases<AnyResult>);
}
