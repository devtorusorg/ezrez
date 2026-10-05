/**
 * @module
 * Core result constructors, guards, and types with no utility dependencies.
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
