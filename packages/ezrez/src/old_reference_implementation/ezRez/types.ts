// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- empty object is intended
export type SomeValue = {} | null | undefined;
export type SomeObject = object;
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type IsNever<T> = [T] extends [never] ? true : false;

// Base error object structure - unified pattern
export type EzFailureObject<T extends string = string, D = never> =
  IsNever<D> extends true ? { type: T; message: string } : { type: T; message: string; data: D };

// Extract type from failure object
export type ExtractFailureType<F extends EzFailureObject> = F["type"];

// Extract data from failure object (returns never if no data)
export type ExtractFailureData<F extends EzFailureObject> = F extends { data: infer D } ? D : never;

// Internal type for runtime failure structure
export type EzFailureBase<T extends string> = Readonly<{
  type: T;
  message: string;
}>;

export type EzFailure<T extends string, FD> =
  IsNever<FD> extends true
    ? EzFailureBase<T>
    : EzFailureBase<T> &
        Readonly<{
          data: FD;
        }>;

// EzRezFail - unified pattern only
export type EzRezFail<F extends EzFailureObject = EzFailureObject> = {
  isSuccess: false;
  value?: never;
  failure: F extends EzFailureObject<infer Type, infer Data>
    ? IsNever<Data> extends true
      ? EzFailureBase<Type>
      : EzFailureBase<Type> & Readonly<{ data: Data }>
    : EzFailureBase<string>;
};

export type EzRezOk<V extends SomeValue = SomeValue> = Readonly<{
  isSuccess: true;
  value: V;
  failure?: never;
}>;

// EzRez - unified pattern only
// Usage: EzRez<SuccessValue, {type: 'ERROR', message: string, data: ErrorData} | ...>
export type EzRez<V extends SomeValue = SomeValue, F extends EzFailureObject = EzFailureObject> =
  | EzRezOk<V>
  | EzRezFail<F>;

export type AsEzRezFail<Rez extends EzRez<SomeValue>> = Extract<Rez, { isSuccess: false }>;
export type AsEzRezOk<Rez extends EzRez<SomeValue>> = Extract<Rez, { isSuccess: true }>;
export type PickEzRezFailure<Rez extends EzRez<SomeValue>> = AsEzRezFail<Rez>["failure"] & {
  type: string;
};

export type EzRezTransformer<
  InRez extends EzRez<SomeValue>,
  OutRez extends EzRez<SomeValue> = InRez,
> = (ezRez: InRez) => OutRez;

export type EzRezCatchTransformer<
  InRez extends EzRez<SomeValue>,
  OutRez extends EzRez<SomeValue> = EzRez<SomeValue>,
> = EzRezTransformer<AsEzRezFail<InRez>, OutRez>;

export type RezCatch<
  InRez extends EzRez<SomeValue>,
  Handler extends EzRezCatchTransformer<InRez, EzRez<SomeValue>>,
> = {
  filter: (failure: PickEzRezFailure<InRez>) => boolean;
  handler: Handler;
  isAsync: false;
};

export type ToEzRezCatch<F extends EzFailureObject> = (error: unknown) => EzRezFail<F>;

// Async handler types
export type EzRezAsyncCatchTransformer<
  InRez extends EzRez<SomeValue>,
  OutRez extends EzRez<SomeValue> = EzRez<SomeValue>,
> = (ezRez: AsEzRezFail<InRez>) => Promise<OutRez>;

export type RezAsyncCatch<
  InRez extends EzRez<SomeValue>,
  Handler extends EzRezAsyncCatchTransformer<InRez, EzRez<SomeValue>>,
> = {
  filter: (failure: PickEzRezFailure<InRez>) => boolean;
  handler: Handler;
  isAsync: true;
};

// Union type for both sync and async handlers
export type RezAnyCatch<InRez extends EzRez<SomeValue>> =
  | RezCatch<InRez, EzRezCatchTransformer<InRez, EzRez<SomeValue>>>
  | RezAsyncCatch<InRez, EzRezAsyncCatchTransformer<InRez, EzRez<SomeValue>>>;

// Helper to determine if a handler returns a promise
export type IsAsyncHandler<Handler> = Handler extends (...args: unknown[]) => Promise<unknown>
  ? true
  : false;

// Helper to extract the return type from a handler, unwrapping Promise if present
export type ExtractHandlerReturnType<Handler> = Handler extends (
  ...args: unknown[]
) => Promise<infer T>
  ? T
  : Handler extends (...args: unknown[]) => infer T
    ? T
    : never;

// Conditional type that returns Promise<T> if any handler is async, otherwise T
export type MaybePromise<T, IsAsync extends boolean> = IsAsync extends true ? Promise<T> : T;
