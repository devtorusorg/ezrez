/**
 * Auth-specific error types and constants for ezRez pattern
 */

import { ezFail } from "./core";
import type { EzFailureObject, EzRezFail, Prettify, SomeObject } from "./types";

// helpers
type AreAllPropsOptional<T> = Partial<T> extends T ? true : false;
type MaybeNeverProp<M, T extends keyof M, P extends string> =
  Extract<M[T], Record<P, unknown>> extends never ? never : Extract<M[T], Record<P, unknown>>[P];
type OptionalIfAllPropsOptional<T> = T extends never
  ? never
  : AreAllPropsOptional<T> extends true
    ? T | undefined
    : T;

export type ErrorMapEntry<S extends string, D extends SomeObject = SomeObject> = {
  message: S;
  data?: D;
};
export type ErrorMap<
  T extends string = string,
  M extends string = string,
  D extends SomeObject = SomeObject,
> = Record<T, ErrorMapEntry<M, D>>;

export type ErrorMapTypes<M extends ErrorMap> = keyof M & string;
export type ErrorMapMessage<M extends ErrorMap, T extends keyof M> = M[T]["message"];

export type ErrorDataInput<M extends ErrorMap, T extends keyof M> = OptionalIfAllPropsOptional<
  MaybeNeverProp<M, T, "data">
>;

export type ErrorData<M extends ErrorMap, T extends keyof M> = MaybeNeverProp<M, T, "data">;

// Convert ErrorMap to unified EzFailureObject union type
export type ErrorMapToFailureUnion<M extends ErrorMap> = {
  [K in keyof M]: ErrorData<M, K> extends never
    ? { type: K & string; message: M[K]["message"] }
    : { type: K & string; message: M[K]["message"]; data: ErrorData<M, K> };
}[keyof M];

export type ErrorMapToEzFailMap<M extends ErrorMap> = {
  [K in keyof M]: Prettify<{ readonly type: K } & M[K]>;
};

export type FailurePicker<M extends ErrorMap, T extends keyof M> = ErrorMapToEzFailMap<M>[T];

export function ezFailFactory<M extends ErrorMap>(errorMap: M) {
  function ezFailCreator<T extends ErrorMapTypes<M>>(
    failureType: T,
    ...args: ErrorDataInput<M, T> extends never ? [] : [ErrorDataInput<M, T>]
  ): EzRezFail<EzFailureObject<T, ErrorData<M, T>>> {
    const data = args[0];
    const authErr = errorMap[failureType];
    if (!authErr) {
      throw new Error(`Unknown failure type: ${failureType}`);
    }

    const hasDefaultData = Object.hasOwn(authErr, "data");
    const hasInputData = args.length > 0 && data !== undefined;
    const mergedData = (
      hasDefaultData && hasInputData
        ? { ...authErr.data, ...data }
        : hasInputData
          ? data
          : authErr.data
    ) as ErrorData<M, T> | undefined;

    return mergedData !== undefined
      ? ezFail(failureType, authErr.message, mergedData)
      : ezFail(failureType, authErr.message);
  }
  return ezFailCreator;
}
