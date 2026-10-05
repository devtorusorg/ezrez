/**
 * @module
 * Core result constructors, guards, and types with no utility dependencies.
 *
 * @example
 * ```ts
 * import { fail, isError, ok } from "@devtorusorg/ezrez/core";
 *
 * const result = Math.random() > 0.5 ? ok(1) : fail("UNAVAILABLE");
 * if (isError(result)) console.error(result.cause.message);
 * ```
 */

export { fail, ok } from "./constructors.js";
export { isError, isEzRez, isSuccess } from "./guards.js";
export type {
  AnyResult,
  ErrorContext,
  ErrorDescriptor,
  ErrorOf,
  ErrorSnapshot,
  ErrorSnapshotWithContext,
  EzFailOf,
  EzRez,
  Fail,
  JsonValue,
  Normalize,
  Ok,
  Prettify,
  SuccessOf,
  WithCause,
} from "./types.js";
