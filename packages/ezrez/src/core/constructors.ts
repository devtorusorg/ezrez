import { normalizeCause, normalizeContext } from "./normalize-cause.js";
import type {
  ErrorDescriptor,
  ErrorSnapshot,
  Fail,
  FailureCauseOf,
  JsonValue,
  Ok,
} from "./types.js";

const descriptorKeys: Readonly<Record<string, true>> = {
  tag: true,
  name: true,
  message: true,
  stack: true,
  cause: true,
  context: true,
};

type TaggedDescriptor<Tag extends string = string> = Readonly<{ tag: Tag } & ErrorDescriptor>;
type ValidDescriptor<D extends Error | ErrorDescriptor> = D extends Error
  ? D
  : Exclude<keyof D, keyof ErrorDescriptor> extends never
    ? D
    : never;
type ValidTaggedDescriptor<F extends TaggedDescriptor> = F["tag"] extends "success"
  ? never
  : Exclude<keyof F, keyof TaggedDescriptor> extends never
    ? F
    : never;

function isNativeError(value: Error | ErrorDescriptor): value is Error {
  return value instanceof Error || Object.prototype.toString.call(value) === "[object Error]";
}

function assertDescriptor(value: ErrorDescriptor, tagged: boolean): void {
  if (
    Object.getOwnPropertySymbols(value).length > 0 ||
    !Object.getOwnPropertyNames(value).every(
      (key) => descriptorKeys[key] === true && (tagged || key !== "tag"),
    )
  )
    throw new TypeError("Failure descriptor contains unsupported fields");
  if (value.name !== undefined && typeof value.name !== "string")
    throw new TypeError("Failure descriptor name must be a string");
  if (value.message !== undefined && typeof value.message !== "string")
    throw new TypeError("Failure descriptor message must be a string");
  if (value.stack !== undefined && typeof value.stack !== "string")
    throw new TypeError("Failure descriptor stack must be a string");
  if (
    value.context !== undefined &&
    (typeof value.context !== "object" || value.context === null || Array.isArray(value.context))
  )
    throw new TypeError("Failure descriptor context must be an object");
}

function snapshot(
  tag: string,
  descriptor?: Error | ErrorDescriptor,
  tagged = false,
): ErrorSnapshot {
  if (descriptor === undefined) return { name: "Error", message: tag, cause: null };
  if (isNativeError(descriptor)) return normalizeCause(descriptor) as ErrorSnapshot;
  assertDescriptor(descriptor, tagged);
  const output: {
    name: string;
    message: string;
    stack?: string;
    cause: ErrorSnapshot | null;
    context?: Readonly<Record<string, JsonValue>>;
  } = {
    name: descriptor.name ?? "Error",
    message: descriptor.message ?? tag,
    cause: normalizeCause(descriptor.cause),
  };
  if (descriptor.stack !== undefined) output.stack = descriptor.stack;
  if (descriptor.context !== undefined) output.context = normalizeContext(descriptor.context);
  return output;
}

/**
 * Creates a success result while preserving the exact payload type.
 *
 * @typeParam S - Success payload type.
 * @param value - Value carried by the success branch.
 * @returns A `{ tag: "success", value }` result.
 *
 * @example
 * ```ts
 * const result = ok({ id: "user-1" });
 * ```
 */
export function ok<S>(value: S): Ok<S> {
  return { tag: "success", value };
}

export function fail<const Tag extends string>(tag: Tag extends "success" ? never : Tag): Fail<Tag>;
export function fail<const Tag extends string, const D extends Error | ErrorDescriptor>(
  tag: Tag extends "success" ? never : Tag,
  descriptor: ValidDescriptor<D>,
): Fail<Tag, FailureCauseOf<D>>;
export function fail<const F extends TaggedDescriptor>(
  input: ValidTaggedDescriptor<F>,
): Fail<F["tag"], FailureCauseOf<F>>;
/**
 * Creates an exact failure envelope with a normalized, non-null error snapshot.
 *
 * @param input - Failure tag or an inline tagged descriptor.
 * @param descriptor - Optional native error or snapshot descriptor for a tag input.
 * @returns A failure result preserving the literal tag and inferred cause context.
 * @throws {TypeError} If the tag is `"success"` or the descriptor has unsupported fields.
 *
 * @example
 * ```ts
 * const result = fail("NOT_FOUND", { message: "User does not exist" });
 * ```
 */
export function fail(
  input: string | TaggedDescriptor,
  descriptor?: Error | ErrorDescriptor,
): Fail<string> {
  const tag = typeof input === "string" ? input : input.tag;
  if (tag === "success") throw new TypeError('Failure tag "success" is reserved');
  if (typeof tag !== "string") throw new TypeError("Failure tag must be a string");
  if (typeof input !== "string") assertDescriptor(input, true);
  return {
    tag,
    cause: snapshot(tag, typeof input === "string" ? descriptor : input, typeof input !== "string"),
  };
}
