import type { Fail, FailureInput, Ok, WithCause } from "./types.js";

export function ok<S>(value: S): Ok<S> {
  return { isSuccess: true, value };
}

/** Creates a plain failure; normalize native exceptions with normalizeCause first. */
export function fail<const F extends FailureInput>(failure: F): Fail<WithCause<F>> {
  // The distributive type preserves each input union member and makes cause required.
  // Spreading creates a new data object; the only transformed field is cause.
  return {
    isSuccess: false,
    failure: { ...failure, cause: failure.cause ?? null },
  } as Fail<WithCause<F>>;
}
