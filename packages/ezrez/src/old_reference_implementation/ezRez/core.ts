import type {
  EzFailureBase,
  EzFailureObject,
  EzRez,
  EzRezFail,
  EzRezOk,
  SomeObject,
  SomeValue,
} from "./types";

export function ezOk<T extends SomeValue>(value: T): EzRezOk<T> {
  return { isSuccess: true, value };
}

// Helper to create EzRezFail with unified failure object pattern
export function ezFailFrom<T extends string, D>(
  failureObj: D extends never
    ? { type: T; message: string }
    : { type: T; message: string; data: D },
): EzRezFail<EzFailureObject<T, D>> {
  const failure =
    "data" in failureObj
      ? { type: failureObj.type, message: failureObj.message, data: failureObj.data }
      : { type: failureObj.type, message: failureObj.message };
  return {
    isSuccess: false,
    failure,
  } as EzRezFail<EzFailureObject<T, D>>;
}

// Runtime API for creating failures (backward compatible at runtime, but returns unified type)
export function ezFail<T extends string>(
  type: T,
  message: string,
): EzRezFail<EzFailureObject<T, never>>;
export function ezFail<T extends string>(
  type: T,
  message: string,
  data: undefined,
): EzRezFail<EzFailureObject<T, never>>;
export function ezFail<T extends string, FD extends SomeObject>(
  type: T,
  message: string,
  data: FD,
): EzRezFail<EzFailureObject<T, FD>>;
export function ezFail<T extends string, FD extends SomeObject>(
  type: T,
  message: string,
  data?: FD,
): EzRezFail<EzFailureObject<T, FD>> {
  const failure =
    data !== undefined && data !== null
      ? ({ type, message, data } as const)
      : ({ type, message } as EzFailureBase<T>);
  return {
    isSuccess: false,
    failure,
  } as EzRezFail<EzFailureObject<T, FD>>;
}

export function isEzRez<R extends EzRez>(candidate: unknown): candidate is R {
  if (typeof candidate !== "object" || candidate === null || !("isSuccess" in candidate)) {
    return false;
  }

  if (candidate.isSuccess === true) {
    return "value" in candidate && !("failure" in candidate);
  }

  if (candidate.isSuccess === false) {
    if (!("failure" in candidate) || "value" in candidate) {
      return false;
    }

    return isEzFailure(candidate.failure);
  }

  return false;
}

function isEzFailure(candidate: unknown): candidate is EzFailureBase<string> {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "type" in candidate &&
    typeof candidate.type === "string" &&
    "message" in candidate &&
    typeof candidate.message === "string" &&
    ("data" in candidate ? typeof candidate.data === "object" && candidate.data !== null : true)
  );
}
