/** JSON-compatible data. Numbers must be finite at runtime. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ErrorContext = Readonly<Record<string, JsonValue>>;

export interface ErrorSnapshot {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly cause: ErrorSnapshot | null;
  readonly context?: ErrorContext;
}

/** An error snapshot whose application context is known to be present and typed. */
export type ErrorSnapshotWithContext<C extends ErrorContext> = Omit<ErrorSnapshot, "context"> & {
  context: C;
};

/** Normalized native error carried by a failure result. */
export type Failure<Cause extends ErrorSnapshot = ErrorSnapshot> = Readonly<{
  cause: Cause;
}>;

/** Named success branch shape for stable editor display. */
export interface Ok<S> {
  readonly tag: "success";
  readonly value: S;
  readonly cause?: never;
}

/** A failure envelope preserves the type of its correlated error snapshot. */
export interface Fail<Tag extends string, Cause extends ErrorSnapshot = ErrorSnapshot> {
  readonly tag: Tag;
  readonly cause: Cause;
  readonly value?: never;
}

/** Failure result for one tag or a union of tags. */
export type EzFailOf<T extends string> = T extends "success" ? never : Fail<T>;

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

/** Overrides merged into the default `{ name: "Error", message: tag, cause: null }` snapshot. */
export type ErrorDescriptor = Readonly<{
  name?: string | undefined;
  message?: string | undefined;
  stack?: string | undefined;
  cause?: unknown;
  context?: ErrorContext | undefined;
}>;

type DescriptorCause<D> = D extends { context: infer C extends ErrorContext }
  ? ErrorSnapshotWithContext<C>
  : ErrorSnapshot;

export type FailureCauseOf<D> = D extends Error ? ErrorSnapshot : DescriptorCause<D>;

/** Constructor shorthand or an inline tagged error descriptor. */
export type FailureInput<Tag extends string = string> =
  | Tag
  | Readonly<{ tag: Tag } & ErrorDescriptor>;

/** Resolve either constructor input form to its exact failure envelope. */
export type WithCause<F extends FailureInput> = F extends string
  ? Fail<F>
  : F extends { tag: infer Tag extends string }
    ? Fail<Tag, FailureCauseOf<F>>
    : never;
