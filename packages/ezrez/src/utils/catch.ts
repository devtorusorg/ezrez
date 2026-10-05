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

/** Handles one tag. Use `catchTag<R>()` when the handler needs R's exact correlated cause type. */
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

/** Handles the supplied subset of tags. Use `catchTags<R>()` for exact callback types. */
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

/** Handles every finite tag. The typed form rejects missing and unknown keys. */
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

/** Handles every failure with an explicit fallback callback. */
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

/** Applies the first matching catcher. Unmatched failures pass through unchanged. */
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

/** Async runner for the same catcher descriptors. */
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
