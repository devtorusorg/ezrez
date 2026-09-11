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

export type Failure<Tag extends string = string, Message extends string = string> = Readonly<{
  tag: Tag;
  message: Message;
  cause: ErrorSnapshot | null;
}>;

export type Ok<S> = Readonly<{ isSuccess: true; value: S }>;
export type Fail<E extends Failure> = Readonly<{ isSuccess: false; failure: E }>;

/** Failure payload for one tag or a union of tags, not the result envelope. */
export type EzFailOf<T extends string, Message extends string = string> = T extends string
  ? Failure<T, Message>
  : never;

/** Expand tag shorthand while retaining complete custom failure members. */
type ResolveFailure<E extends string | Failure> = E extends string
  ? EzFailOf<E>
  : E extends Failure
    ? E
    : never;

/** Accept tags or complete failures; impossible branches disappear. */
export type EzRez<S, E extends string | Failure = never> =
  | ([S] extends [never] ? never : Ok<S>)
  | ([E] extends [never] ? never : Fail<ResolveFailure<E>>);

/** Broad boundary type for guards and generic utilities, not a default error. */
export type AnyResult = Ok<unknown> | Fail<Failure>;

export type SuccessOf<R> = R extends { isSuccess: true; value: infer S } ? S : never;
export type ErrorOf<R> = R extends { isSuccess: false; failure: infer E extends Failure }
  ? E
  : never;
export type Normalize<R extends AnyResult> = EzRez<SuccessOf<R>, ErrorOf<R>>;

/** Flattens intersections while preserving the visible shape of a type. */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

type BaseFailureKeys = keyof Failure;
type SimplifyFailure<E extends Failure> = E extends Failure
  ? [Exclude<keyof E, BaseFailureKeys>] extends [never]
    ? E["tag"]
    : Prettify<E>
  : never;

/** Concise public result type for inferred functions; custom failure fields remain typed. */
export type Simplified<R extends AnyResult> = EzRez<SuccessOf<R>, SimplifyFailure<ErrorOf<R>>>;

/** Input accepts native Errors or snapshots; produced failures always contain a snapshot or null. */
export type FailureInput = Readonly<{
  tag: string;
  message: string;
  cause?: ErrorSnapshot | Error | null | undefined;
}>;

type NormalizedCause<C> = C extends null | undefined
  ? null
  : C extends ErrorSnapshot
    ? C
    : C extends Error
      ? ErrorSnapshot
      : never;

/** Distribute over input unions to preserve tag/custom-field correlations. */
export type WithCause<F extends FailureInput> = F extends FailureInput
  ? [Exclude<keyof F, keyof FailureInput>] extends [never]
    ? Failure<F["tag"], F["message"]>
    : Prettify<
        Omit<F, "tag" | "message" | "cause"> &
          Failure<F["tag"], F["message"]> & {
            cause: "cause" extends keyof F ? NormalizedCause<F["cause"]> : null;
          }
      >
  : never;
