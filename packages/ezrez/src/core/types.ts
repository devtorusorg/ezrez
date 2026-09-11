/** JSON-compatible data. Numbers must be finite at runtime. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ErrorSnapshot = Readonly<{
  name: string;
  message: string;
  stack?: string;
  cause: ErrorSnapshot | null;
  details?: Readonly<Record<string, JsonValue>>;
}>;

export type Failure = Readonly<{
  type: string;
  message: string;
  cause: ErrorSnapshot | null;
}>;

export type Ok<S> = Readonly<{ isSuccess: true; value: S }>;
export type Fail<E extends Failure> = Readonly<{ isSuccess: false; failure: E }>;

/** Impossible branches disappear; success-only results have no error type. */
export type EzRez<S, E extends Failure = never> =
  | ([S] extends [never] ? never : Ok<S>)
  | ([E] extends [never] ? never : Fail<E>);

/** Broad boundary type for guards and generic utilities, not a default error. */
export type AnyResult = Ok<unknown> | Fail<Failure>;

export type SuccessOf<R> = R extends { isSuccess: true; value: infer S } ? S : never;
export type ErrorOf<R> = R extends { isSuccess: false; failure: infer E extends Failure }
  ? E
  : never;
export type Normalize<R extends AnyResult> = EzRez<SuccessOf<R>, ErrorOf<R>>;

/** Input accepts an omitted cause; produced failures always include it. */
export type FailureInput = Readonly<{
  type: string;
  message: string;
  cause?: ErrorSnapshot | null | undefined;
}>;

/** Distribute over input unions to preserve tag/custom-field correlations. */
export type WithCause<F extends FailureInput> = F extends FailureInput
  ? Readonly<
      Omit<F, "cause"> & {
        cause: "cause" extends keyof F
          ? Exclude<F["cause"], undefined> | (undefined extends F["cause"] ? null : never)
          : null;
      }
    >
  : never;
