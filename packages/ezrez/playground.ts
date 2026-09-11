/**
 * IDE playground: valid usage first, then intentional errors for hover diagnostics.
 * Excluded from normal typecheck/build/lint; no @ts-expect-error suppressions here.
 */
import {
  fail,
  isError,
  isEzRez,
  isSuccess,
  normalizeCause,
  ok,
  type ErrorOf,
  type EzRez,
  type Fail,
  type SuccessOf,
} from "./src/index.js";

// Construct a success-only result.
const cachedCount: EzRez<number> = ok(3);

// A tag-only failure gets the default ErrorSnapshot.
const defaultFailure = fail("DEFAULT_FAILURE");
defaultFailure.cause.name; // "Error"
defaultFailure.cause.message; // "DEFAULT_FAILURE"
defaultFailure.cause.cause; // null

// An object with only a tag is equivalent to the string shorthand.
const objectFailure = fail({ tag: "OBJECT_FAILURE" });

// A second-argument descriptor overrides the default snapshot fields.
const describedFailure = fail("INVALID_INPUT", {
  name: "ValidationError",
  message: "The input is invalid",
  stack: "validation stack",
  context: { field: "email", retryable: false },
});

// The inline tagged form accepts the same descriptor fields.
const inlineFailure = fail({
  tag: "INLINE_FAILURE",
  message: "Inline descriptor",
  context: { source: "playground" },
});

// A native Error becomes the primary snapshot, preserving custom fields.
const unavailable = fail(
  "SERVICE_UNAVAILABLE",
  Object.assign(new Error("connection refused"), { status: 503 }),
);
unavailable.cause.context?.status; // 503

// A normalized snapshot can be passed as the primary cause too.
const snapshot = normalizeCause(new Error("already normalized"));
const explicitSnapshot = snapshot === null ? fail("NO_SNAPSHOT") : fail("EXPLICIT_SNAPSHOT", snapshot);

// An inline descriptor cause is nested beneath the generated outer snapshot.
const nestedFailure = fail({
  tag: "WRAPPED_FAILURE",
  cause: new Error("underlying failure"),
});
nestedFailure.cause.message; // "WRAPPED_FAILURE"
nestedFailure.cause.cause?.message; // "underlying failure"

// Undefined descriptor fields preserve defaults.
const defaultedDescriptor = fail("DEFAULTED_DESCRIPTOR", {
  name: undefined,
  message: undefined,
  stack: undefined,
});
defaultedDescriptor.cause.message; // "DEFAULTED_DESCRIPTOR"

// Native inference preserves every result branch directly.
function divide(a: number, b: number) {
  if (b === 0) return fail("DIVIDE_BY_ZERO");
  return ok(a / b);
}

const division = divide(10, 2);
if (isSuccess(division)) {
  division.value; // number
} else {
  division.tag; // "DIVIDE_BY_ZERO"
  division.cause; // ErrorSnapshot
}

// Native inference preserves the exact correlated result union without a wrapper.
const parsePort = (input: string) => {
  const port = Number(input);
  if (!Number.isInteger(port)) {
    return fail("INVALID_PORT", { message: `Invalid port: ${input}`, context: { input } });
  }
  return ok(port);
};

const parsedPort = parsePort("3000");
if (isError(parsedPort)) {
  parsedPort.cause; // ErrorSnapshot
  if (parsedPort.tag === "INVALID_PORT") {
    parsedPort.cause.context.input; // string: tag and context stay correlated
  }
}

// Explicit annotations are useful when the public failure contract is fixed in advance.
type MissingUser = Fail<"USER_NOT_FOUND">;
function findUser(userId: string): EzRez<{ id: string; name: string }, MissingUser> {
  if (userId !== "user-1") {
    return fail("USER_NOT_FOUND");
  }
  return ok({ id: userId, name: "Ada" });
}

// Native async inference preserves Promise<EzRez<...>>.
const findUserAsync = async (userId: string) => {
  if (!userId) return fail("INVALID_USER_ID");
  return ok({ id: userId, name: "Ada" });
};
type AsyncUserResult = Awaited<ReturnType<typeof findUserAsync>>;
type AsyncUser = SuccessOf<AsyncUserResult>;
type AsyncUserFailure = ErrorOf<AsyncUserResult>;

// Validate unknown values before consuming them as result envelopes.
const transported: unknown = { tag: "success", value: 42 };
if (isEzRez(transported) && isSuccess(transported)) {
  transported.value; // unknown: isEzRez validates the envelope, not application data
}


// Intentional errors: hover each expression to inspect the expected diagnostic.
const cannotFail: EzRez<number> = fail("NOPE");
const wrongTag: EzRez<number, "DIVIDE_BY_ZERO"> = fail("OTHER");
const reservedStringTag = fail("success");
const reservedObjectTag = fail({ tag: "success" });
const nonStringTag = fail(123);
const extraDescriptorField = fail("INVALID", { message: "bad", extra: true });
const extraInlineField = fail({ tag: "INVALID", message: "bad", extra: true });
const invalidDescriptorName = fail("INVALID", { name: 123 });
const invalidDescriptorContext = fail("INVALID", { context: [] });
const legacyDiscriminator = fail({ type: "OLD" });
const legacyNestedFailure = fail({ tag: "OLD", failure: { cause: null } });
const malformedTransportedFailure: unknown = {
  tag: "REMOTE",
  cause: null,
};
const rejectedTransportedFailure = isEzRez(malformedTransportedFailure); // false

void cachedCount;
void defaultFailure;
void objectFailure;
void describedFailure;
void inlineFailure;
void unavailable;
void explicitSnapshot;
void nestedFailure;
void defaultedDescriptor;
void findUser;
void cannotFail;
void wrongTag;
void reservedStringTag;
void reservedObjectTag;
void nonStringTag;
void extraDescriptorField;
void extraInlineField;
void invalidDescriptorName;
void invalidDescriptorContext;
void legacyDiscriminator;
void legacyNestedFailure;
void rejectedTransportedFailure;
