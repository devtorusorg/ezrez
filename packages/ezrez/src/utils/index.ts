/**
 * @module
 * Matching, recovery, fallback, and error-normalization utilities for EzRez values.
 *
 * @example
 * ```ts
 * import { fail, ok } from "@devtorusorg/ezrez/core";
 * import { match } from "@devtorusorg/ezrez/utils";
 *
 * const message = match(Math.random() > 0.5 ? ok(1) : fail("UNAVAILABLE"), {
 *   success: (value) => String(value),
 *   errors: { UNAVAILABLE: () => "Try again" },
 * });
 * ```
 */

export { catchAll, catchAllTags, catchTag, catchTags, recover, recoverAsync } from "./catch.js";
export { getOr } from "./get-or.js";
export { match, matchAsync } from "./match.js";
export { normalizeCause } from "./normalize-cause.js";
export type {
  AllCatcher,
  Catcher,
  TagCatcher,
  TagsCatcher,
} from "./catch.js";
export type {
  AsyncMatchCases,
  AsyncMatchOutput,
  FailureForTag,
  FailureTags,
  MatchCases,
  MatchOutput,
} from "./types.js";
