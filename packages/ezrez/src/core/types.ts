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
  context?: Readonly<Record<string, JsonValue>>;
}>;

/** Normalized native error carried by a failure result. */
export type Failure = Readonly<{
  cause: ErrorSnapshot;
}>;

export type Ok<S> = Readonly<{ tag: "success"; value: S; cause?: never }>;

/** A failure envelope always contains a normalized error snapshot. */
export type Fail<Tag extends string> = Tag extends "success"
  ? never
  : Readonly<{ tag: Tag; cause: ErrorSnapshot; value?: never }>;

/** Failure result for one tag or a union of tags. */
export type EzFailOf<T extends string> = T extends string ? Fail<T> : never;

type AnyFailure = Fail<string>;

/** Expand tag shorthand while retaining complete failure envelopes. */
type ResolveFailure<E extends string | AnyFailure> = E extends string
  ? EzFailOf<E>
  : E extends AnyFailure
    ? E
    : never;

/** Accept tags or complete failure branches; impossible branches disappear. */
export type EzRez<S, E extends string | AnyFailure = never> =
  | ([S] extends [never] ? never : Ok<S>)
  | ([E] extends [never] ? never : ResolveFailure<E>);

/** Broad boundary type for guards and generic utilities, not a default error. */
export type AnyResult = Ok<unknown> | AnyFailure;

export type SuccessOf<R> = R extends { tag: "success"; value: infer S } ? S : never;
export type ErrorOf<R> = R extends AnyFailure ? R : never;
export type Normalize<R extends AnyResult> = EzRez<SuccessOf<R>, ErrorOf<R>>;

/** Flattens intersections while preserving the visible shape of a type. */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

type SimplifyFailure<E extends AnyFailure> = E extends AnyFailure ? E["tag"] : never;

/** Concise public result type for inferred functions. */
export type Simplified<R extends AnyResult> = EzRez<SuccessOf<R>, SimplifyFailure<ErrorOf<R>>>;

/** Overrides merged into the default `{ name: "Error", message: tag, cause: null }` snapshot. */
export type ErrorDescriptor = Readonly<{
  name?: string | undefined;
  message?: string | undefined;
  stack?: string | undefined;
  cause?: unknown;
  context?: Readonly<Record<string, JsonValue>> | undefined;
}>;

/** Constructor shorthand or an inline tagged error descriptor. */
export type FailureInput<Tag extends string = string> =
  | Tag
  | Readonly<{ tag: Tag } & ErrorDescriptor>;

/** Resolve either constructor input form to its exact failure envelope. */
export type WithCause<F extends FailureInput> = F extends string
  ? Fail<F>
  : F extends { tag: infer Tag extends string }
    ? Fail<Tag>
    : never;
