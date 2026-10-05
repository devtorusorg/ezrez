import { isSuccess } from "../core/guards.js";
import type { AnyResult, ErrorOf, Fail, Normalize, Ok } from "../core/types.js";
import type { FailureForTag, FailureTags } from "./types.js";

type CatchHandler = (failure: never) => unknown;
type CatchHandlers = Readonly<Record<string, CatchHandler>>;

/** A keyed handler map with an optional fallback handler. */
export type Catcher<Handlers extends object = CatchHandlers, Fallback = undefined> = Readonly<{
  handlers: Handlers;
  fallback?: Fallback;
}>;

/** A catcher descriptor for one failure tag. */
export type TagCatcher<Tag extends string, Handler> = Catcher<Readonly<Record<Tag, Handler>>>;
/** A catcher descriptor for a subset of failure tags. */
export type TagsCatcher<Handlers extends object> = Catcher<Handlers>;
/** A catcher descriptor with an explicit fallback for every failure. */
export type AllCatcher<Handler> = Catcher<Readonly<Record<never, never>>, Handler> &
  Readonly<{ fallback: Handler }>;

type HandlerFor<R extends AnyResult, Tag extends FailureTags<R>> = (
  failure: FailureForTag<R, Tag>,
) => AnyResult;
type HandlersFor<R extends AnyResult> = Partial<{
  [Tag in FailureTags<R>]: HandlerFor<R, Tag>;
}>;
type AllHandlerFor<R extends AnyResult> = (failure: ErrorOf<R>) => AnyResult;

function tagged<Tag extends string, Handler>(tag: Tag, handler: Handler): TagCatcher<Tag, Handler> {
  return { handlers: { [tag]: handler } } as TagCatcher<Tag, Handler>;
}

/**
 * Creates a catcher for one failure tag.
 *
 * Call `catchTag<R>()` first when the handler needs `R`'s exact correlated cause type.
 *
 * @param tag - Failure tag to handle.
 * @param handler - Callback that returns a replacement result.
 * @returns Reusable catcher descriptor for {@link recover} or {@link recoverAsync}.
 */
export function catchTag<const Tag extends string, Handler extends (failure: Fail<Tag>) => unknown>(
  tag: Tag,
  handler: Handler,
): TagCatcher<Tag, Handler>;
export function catchTag<R extends AnyResult>(): <
  const Tag extends FailureTags<R>,
  Handler extends HandlerFor<R, Tag>,
>(
  tag: Tag,
  handler: Handler,
) => TagCatcher<Tag, Handler>;
export function catchTag(tag?: unknown, handler?: unknown): unknown {
  if (tag === undefined)
    return (nextTag: string, nextHandler: (failure: Fail<string>) => unknown) =>
      tagged(nextTag, nextHandler);
  return tagged(tag as string, handler);
}

/**
 * Creates a catcher for a supplied subset of failure tags.
 *
 * Call `catchTags<R>()` first for exact callback types.
 *
 * @param handlers - Map from failure tags to replacement-result callbacks.
 * @returns Reusable catcher descriptor for {@link recover} or {@link recoverAsync}.
 */
export function catchTags<Handlers extends Record<string, (failure: Fail<string>) => unknown>>(
  handlers: Handlers,
): TagsCatcher<Handlers>;
export function catchTags<R extends AnyResult>(): <const Handlers extends HandlersFor<R>>(
  handlers: Handlers,
) => TagsCatcher<Handlers>;
export function catchTags(handlers?: unknown): unknown {
  if (handlers === undefined)
    return (nextHandlers: Record<string, (failure: Fail<string>) => unknown>) => ({
      handlers: nextHandlers,
    });
  return { handlers };
}

/**
 * Creates an exhaustive catcher for every finite failure tag.
 *
 * @returns A function that accepts a complete failure-tag handler map.
 */
export function catchAllTags<R extends AnyResult>(): <
  const Handlers extends { [Tag in FailureTags<R>]: HandlerFor<R, Tag> },
>(
  handlers: Handlers & (Exclude<keyof Handlers, FailureTags<R>> extends never ? unknown : never),
) => TagsCatcher<Handlers>;
export function catchAllTags(handlers?: unknown): unknown {
  if (handlers === undefined)
    return (nextHandlers: Record<string, (failure: Fail<string>) => unknown>) => ({
      handlers: nextHandlers,
    });
  return { handlers };
}

/**
 * Creates a catcher with an explicit fallback for every failure.
 *
 * @param handler - Callback that receives any failure branch and returns a replacement result.
 * @returns Reusable fallback catcher descriptor.
 */
export function catchAll<R extends AnyResult>(): <Handler extends AllHandlerFor<R>>(
  handler: Handler,
) => AllCatcher<Handler>;
export function catchAll<Handler extends (failure: Fail<string>) => unknown>(
  handler: Handler,
): AllCatcher<Handler>;
export function catchAll(handler?: unknown): unknown {
  if (handler === undefined)
    return (nextHandler: (failure: Fail<string>) => unknown) => ({
      handlers: {},
      fallback: nextHandler,
    });
  return { handlers: {}, fallback: handler };
}

type CatcherTags<C> = C extends { fallback: CatchHandler }
  ? string
  : C extends Catcher<infer Handlers, unknown>
    ? keyof Handlers & string
    : never;
type HandlerOutput<Handlers> = Handlers extends object
  ? ReturnType<Extract<Handlers[keyof Handlers], CatchHandler>>
  : never;
type CatcherOutput<C> =
  C extends Catcher<infer Handlers, infer Fallback>
    ? HandlerOutput<Handlers> | ReturnType<Extract<Fallback, CatchHandler>>
    : never;
type Handled<R extends AnyResult, Catchers extends readonly Catcher<object, unknown>[]> =
  string extends CatcherTags<Catchers[number]>
    ? FailureTags<R>
    : Extract<FailureTags<R>, CatcherTags<Catchers[number]>>;
type Remaining<R extends AnyResult, Catchers extends readonly Catcher<object, unknown>[]> =
  ErrorOf<R> extends infer Error
    ? Error extends { tag: infer Tag }
      ? Tag extends Handled<R, Catchers>
        ? never
        : Error
      : never
    : never;
type RecoveryOutput<
  R extends AnyResult,
  Catchers extends readonly Catcher<object, unknown>[],
> = Normalize<
  | Extract<R, Ok<unknown>>
  | Remaining<R, Catchers>
  | Extract<CatcherOutput<Catchers[number]>, AnyResult>
>;
type SynchronousCatchers<Catchers extends readonly Catcher<object, unknown>[]> = {
  [Index in keyof Catchers]: CatcherOutput<Catchers[Index]> extends AnyResult
    ? Catchers[Index]
    : never;
};

type AnyCatcher = Catcher<object, unknown>;

function resultArgument(value: unknown): value is AnyResult {
  return (
    typeof value === "object" &&
    value !== null &&
    ("cause" in value || ("value" in value && (value as { tag?: unknown }).tag === "success"))
  );
}

function handlerFor(catcher: AnyCatcher, tag: string): CatchHandler | undefined {
  if (!Object.hasOwn(catcher.handlers, tag)) return undefined;
  return (catcher.handlers as CatchHandlers)[tag];
}

/**
 * Applies the first matching synchronous catcher.
 *
 * Unmatched failures and successes pass through unchanged. It supports direct and curried forms.
 *
 * @param result - Result to recover, when using the direct form.
 * @param catchers - Catcher descriptors applied in order.
 * @returns The recovered result, preserving unhandled failure branches.
 *
 * @example
 * ```ts
 * const result = recover(fail("NOT_FOUND"), catchTag("NOT_FOUND", () => ok("guest")));
 * ```
 */
export function recover<R extends AnyResult, const Catchers extends readonly AnyCatcher[]>(
  result: R,
  ...catchers: Catchers & SynchronousCatchers<Catchers>
): RecoveryOutput<R, Catchers>;
export function recover<const Catchers extends readonly AnyCatcher[]>(
  ...catchers: Catchers & SynchronousCatchers<Catchers>
): <R extends AnyResult>(result: R) => RecoveryOutput<R, Catchers>;
export function recover(...args: unknown[]) {
  const hasResult = resultArgument(args[0]);
  const catchers = (hasResult ? args.slice(1) : args) as AnyCatcher[];
  const apply = (result: AnyResult): AnyResult => {
    if (isSuccess(result)) return result;
    for (const catcher of catchers) {
      const handler = handlerFor(catcher, result.tag);
      if (handler) return handler(result as never) as AnyResult;
      if (typeof catcher.fallback === "function")
        return (catcher.fallback as CatchHandler)(result as never) as AnyResult;
    }
    return result;
  };
  return hasResult ? apply(args[0] as AnyResult) : apply;
}

/**
 * Applies catcher descriptors to a result or promise of a result.
 *
 * Handlers may return either results or promises of results.
 *
 * @returns A promise of the recovered result.
 */
export function recoverAsync<R extends AnyResult, const Catchers extends readonly AnyCatcher[]>(
  result: R | PromiseLike<R>,
  ...catchers: Catchers
): Promise<RecoveryOutput<R, Catchers>>;
export function recoverAsync<const Catchers extends readonly AnyCatcher[]>(
  ...catchers: Catchers
): <R extends AnyResult>(result: R | PromiseLike<R>) => Promise<RecoveryOutput<R, Catchers>>;
export function recoverAsync(...args: unknown[]) {
  const hasResult =
    (typeof args[0] === "object" && args[0] !== null && "then" in args[0]) ||
    resultArgument(args[0]);
  const catchers = (hasResult ? args.slice(1) : args) as AnyCatcher[];
  const apply = async (input: AnyResult | PromiseLike<AnyResult>): Promise<AnyResult> => {
    const result = await input;
    if (isSuccess(result)) return result;
    for (const catcher of catchers) {
      const handler = handlerFor(catcher, result.tag);
      if (handler) return (await handler(result as never)) as AnyResult;
      if (typeof catcher.fallback === "function")
        return (await (catcher.fallback as CatchHandler)(result as never)) as AnyResult;
    }
    return result;
  };
  return hasResult ? apply(args[0] as AnyResult) : apply;
}
