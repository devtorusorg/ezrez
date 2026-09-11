import { ezFail, ezOk } from "./core";
import type {
  AsEzRezFail,
  AsEzRezOk,
  ExtractHandlerReturnType,
  EzFailureObject,
  EzRez,
  EzRezAsyncCatchTransformer,
  EzRezCatchTransformer,
  PickEzRezFailure,
  RezAnyCatch,
  RezAsyncCatch,
  RezCatch,
  SomeValue,
  ToEzRezCatch,
} from "./types";

// Helper type to check if any catcher in an array has an async handler
type HasAsyncHandler<Catchers extends readonly unknown[]> = Catchers extends readonly [
  ...infer Rest,
  infer Last,
]
  ? Last extends { isAsync: true }
    ? true
    : Rest extends readonly unknown[]
      ? HasAsyncHandler<Rest>
      : false
  : false;

/**
 * Maps an EzRez to a value based on whether it's a success or failure.
 *
 * @param ezRez - The input EzRez result
 * @param mapObj - An object where keys are failure types and values are mapper functions or values.
 *                 Use 'default' key for unhandled failure types.
 * @param successValue - Optional value to return when ezRez is successful. If not provided, returns undefined for success.
 * @returns The successValue if successful (or undefined if not provided), the mapped value for the failure, or undefined if no mapper matches
 *
 * @example
 * const result = ezMapFailureType(someEzRez, {
 *   'NetworkError': (failure) => `Network failed: ${failure.message}`,
 *   'ValidationError': 'Invalid data', // Can use simple values
 *   'default': 'Unknown error', // Default for unhandled types
 * }, 'Success!');
 */
export function ezMapFailureType<
  InRez extends EzRez<SomeValue>,
  MapObj extends {
    [K in PickEzRezFailure<InRez>["type"] | "default"]?:
      | ((
          failure: Extract<PickEzRezFailure<InRez>, { type: K extends "default" ? never : K }>,
        ) => any)
      | any;
  },
  SuccessValue = undefined,
>(
  ezRez: InRez,
  mapObj: MapObj,
  successValue?: SuccessValue,
):
  | SuccessValue
  | (MapObj[PickEzRezFailure<InRez>["type"]] extends (...args: any[]) => infer R ? R : never)
  | undefined {
  if (ezRez.isSuccess) return successValue as any;

  const failure = ezRez.failure;
  const mapper = mapObj[failure.type as keyof MapObj];

  if (mapper !== undefined) {
    // If it's a function, call it; otherwise, return the value directly
    return typeof mapper === "function" ? mapper(failure as any) : mapper;
  }

  // Try default mapper if available
  const defaultMapper = mapObj["default" as keyof MapObj];
  if (defaultMapper !== undefined) {
    return typeof defaultMapper === "function" ? defaultMapper(failure as any) : defaultMapper;
  }

  return undefined as any;
}

// Overload for single sync RezCatch
export function ezTry<
  InRez extends EzRez<SomeValue>,
  Catcher extends RezCatch<InRez, EzRezCatchTransformer<InRez, EzRez<SomeValue>>> = RezCatch<
    InRez,
    EzRezCatchTransformer<InRez, EzRez<SomeValue>>
  >,
>(catch_: Catcher): (ezRez: InRez) => InRez | ReturnType<Catcher["handler"]>;

// Overload for single async RezCatch
export function ezTry<
  InRez extends EzRez<SomeValue>,
  Catcher extends RezAsyncCatch<
    InRez,
    EzRezAsyncCatchTransformer<InRez, EzRez<SomeValue>>
  > = RezAsyncCatch<InRez, EzRezAsyncCatchTransformer<InRez, EzRez<SomeValue>>>,
>(catch_: Catcher): (ezRez: InRez) => Promise<InRez | ExtractHandlerReturnType<Catcher["handler"]>>;

// Overload for multiple sync RezCatch (spread)
export function ezTry<
  InRez extends EzRez<SomeValue>,
  Catchers extends readonly RezCatch<
    InRez,
    EzRezCatchTransformer<InRez, EzRez<SomeValue>>
  >[] = readonly RezCatch<InRez, EzRezCatchTransformer<InRez, EzRez<SomeValue>>>[],
>(...catches: Catchers): (ezRez: InRez) => InRez | ReturnType<Catchers[number]["handler"]>;

// Overload for multiple mixed RezCatch with at least one async (spread)
export function ezTry<
  InRez extends EzRez<SomeValue>,
  Catchers extends readonly RezAnyCatch<InRez>[] = readonly RezAnyCatch<InRez>[],
>(
  ...catches: Catchers
): HasAsyncHandler<Catchers> extends true
  ? (ezRez: InRez) => Promise<InRez | ExtractHandlerReturnType<Catchers[number]["handler"]>>
  : (ezRez: InRez) => InRez | ReturnType<Catchers[number]["handler"]>;

// Implementation
export function ezTry<
  InRez extends EzRez<SomeValue>,
  Catchers extends readonly RezAnyCatch<InRez>[],
>(...catchers: Catchers) {
  const shouldReturnPromise = catchers.some((catcher) => catcher.isAsync === true);

  return (ezRez: InRez) => {
    const result = applyCatchers(ezRez, catchers);
    return shouldReturnPromise ? Promise.resolve(result) : result;
  };
}

function applyCatchers<
  InRez extends EzRez<SomeValue>,
  Catchers extends readonly RezAnyCatch<InRez>[],
>(ezRez: InRez, catchers: Catchers) {
  if (ezRez.isSuccess) return ezRez;

  const catcher = catchers.find((catcher) => catcher.filter(ezRez.failure));
  if (catcher) {
    const handled = catcher.handler(ezRez as AsEzRezFail<InRez>);
    return handled;
  }
  return ezRez;
}

export function ezCatchType<
  InRez extends EzRez<SomeValue>,
  Handler extends EzRezCatchTransformer<InRez, EzRez<SomeValue>> = EzRezCatchTransformer<
    InRez,
    EzRez<SomeValue>
  >,
>(type: PickEzRezFailure<InRez>["type"], handler: Handler): RezCatch<InRez, Handler>;
export function ezCatchType<
  InRez extends EzRez<SomeValue>,
  Handler extends EzRezCatchTransformer<InRez, EzRez<SomeValue>>,
>(type: PickEzRezFailure<InRez>["type"], handler: Handler): RezCatch<InRez, Handler> {
  return {
    filter: (failure: PickEzRezFailure<InRez>) => failure.type === type,
    handler,
    isAsync: false,
  };
}

export function ezCatchTypeAsync<
  InRez extends EzRez<SomeValue>,
  Handler extends EzRezAsyncCatchTransformer<InRez, EzRez<SomeValue>> = EzRezAsyncCatchTransformer<
    InRez,
    EzRez<SomeValue>
  >,
>(type: PickEzRezFailure<InRez>["type"], handler: Handler): RezAsyncCatch<InRez, Handler> {
  return {
    filter: (failure: PickEzRezFailure<InRez>) => failure.type === type,
    handler,
    isAsync: true,
  };
}

export function ezCatchDefault<
  InRez extends EzRez<SomeValue>,
  Handler extends EzRezCatchTransformer<InRez, EzRez<SomeValue>> = EzRezCatchTransformer<
    InRez,
    EzRez<SomeValue>
  >,
>(handler: Handler): RezCatch<InRez, Handler>;
export function ezCatchDefault<
  InRez extends EzRez<SomeValue>,
  Handler extends EzRezCatchTransformer<InRez, EzRez<SomeValue>>,
>(handler: Handler): RezCatch<InRez, Handler> {
  return {
    filter: (_failure: PickEzRezFailure<InRez>) => true,
    handler,
    isAsync: false,
  };
}

export function ezCatchDefaultAsync<
  InRez extends EzRez<SomeValue>,
  Handler extends EzRezAsyncCatchTransformer<InRez, EzRez<SomeValue>> = EzRezAsyncCatchTransformer<
    InRez,
    EzRez<SomeValue>
  >,
>(handler: Handler): RezAsyncCatch<InRez, Handler> {
  return {
    filter: (_failure: PickEzRezFailure<InRez>) => true,
    handler,
    isAsync: true,
  };
}

// Overload for sync handler
export function ezOrThen<InRez extends EzRez<SomeValue>, OutputRez extends EzRez<SomeValue>>(
  ezRez: InRez,
  handler: (failure: PickEzRezFailure<InRez>) => OutputRez,
): AsEzRezOk<InRez> | OutputRez;

// Overload for async handler
export function ezOrThen<InRez extends EzRez<SomeValue>, OutputRez extends EzRez<SomeValue>>(
  ezRez: InRez,
  handler: (failure: PickEzRezFailure<InRez>) => Promise<OutputRez>,
): Promise<AsEzRezOk<InRez> | OutputRez>;

// Implementation
export function ezOrThen<InRez extends EzRez<SomeValue>, OutputRez extends EzRez<SomeValue>>(
  ezRez: InRez,
  handler: (failure: PickEzRezFailure<InRez>) => OutputRez | Promise<OutputRez>,
): AsEzRezOk<InRez> | OutputRez | Promise<AsEzRezOk<InRez> | OutputRez> {
  if (ezRez.isSuccess) return ezRez as AsEzRezOk<InRez>;
  return handler(ezRez.failure);
}

/**
 * @deprecated Prefer explicit `isSuccess` branching. `ezOk(undefined)` returns
 * `[undefined, undefined]`, which is ambiguous after destructuring.
 */
export function getBoth<InRez extends EzRez<SomeValue>>(
  ezRez: InRez,
): [AsEzRezOk<InRez>["value"] | undefined, AsEzRezFail<InRez>["failure"] | undefined] {
  const value = getOr(ezRez, undefined);
  const failure = ezRez.failure;
  return [value, failure] as const;
}

export function getOr<InRez extends EzRez<SomeValue>, OutputValue extends SomeValue>(
  ezRez: InRez,
  orValue: OutputValue,
): AsEzRezOk<InRez>["value"] | OutputValue {
  if (ezRez.isSuccess) return ezRez.value;
  return orValue;
}

export function getTryOr<
  InRez extends EzRez<SomeValue>,
  Catchers extends RezCatch<InRez, EzRezCatchTransformer<InRez, EzRez<SomeValue>>>[],
>(catchers: Catchers, orValue: SomeValue) {
  return (ezRez: InRez) => {
    return getOr(ezTry<InRez, Catchers>(...catchers)(ezRez), orValue);
  };
}

export function toEzRez<V extends SomeValue>(
  cb: () => V,
): EzRez<V, { type: "RuntimeError"; message: string; data: { error: unknown } }>;
export function toEzRez<V extends SomeValue, F extends EzFailureObject>(
  cb: () => V,
  catcher: ToEzRezCatch<F>,
): EzRez<V, F>;
export function toEzRez<V extends SomeValue, F extends EzFailureObject>(
  cb: () => V,
  catcher?: ToEzRezCatch<F>,
) {
  try {
    const value = cb();
    return ezOk(value);
  } catch (error) {
    if (catcher) {
      return catcher(error);
    }
    return runtimeError(error);
  }
}

/**
 * Wrap an async function that might throw into an EzRez
 */
export async function toEzRezAsync<V extends SomeValue>(
  cb: () => Promise<V>,
): Promise<EzRez<V, { type: "RuntimeError"; message: string; data: { error: unknown } }>>;
export async function toEzRezAsync<V extends SomeValue, F extends EzFailureObject>(
  cb: () => Promise<V>,
  catcher: ToEzRezCatch<F>,
): Promise<EzRez<V, F>>;
export async function toEzRezAsync<V extends SomeValue, F extends EzFailureObject>(
  cb: () => Promise<V>,
  catcher?: ToEzRezCatch<F>,
): Promise<EzRez<V, F | { type: "RuntimeError"; message: string; data: { error: unknown } }>> {
  try {
    const value = await cb();
    return ezOk(value);
  } catch (error) {
    if (catcher) {
      return catcher(error);
    }
    return runtimeError(error);
  }
}

function runtimeError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : "Unknown error";

  return ezFail("RuntimeError", message, { error });
}
