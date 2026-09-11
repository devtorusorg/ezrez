/**
 * IDE playground: intentionally invalid examples at the bottom show real errors.
 * Excluded from normal typecheck/build/lint; no @ts-expect-error suppressions here.
 */
import {
  define,
  fail,
  isError,
  normalizeCause,
  ok,
  type EzFailOf,
  type EzRez,
  type Failure,
} from "./src/index.js";

// One tag, or a discriminated union of complete failure payloads.
type DivideByZeroFailure = Failure<"DIVIDE_BY_ZERO", "Cannot divide by zero">;
type MathFailure = EzFailOf<"DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER" | "SOMETHING_ELSE">;

const easytype = define(function divide(a: number, b: number) {
  if (b === 0) return fail({ tag: "DIVIDE_BY_ZERO", message: "Cannot divide by zero" });
  if (a > 100) return fail({ tag: "TOO_BIG_NUMBER", message: "Number exceeds 100" });
  if (a < 0) return fail({ tag: "SOMETHING_ELSE", message: "Negative numbers unsupported" });
  return ok(a / b);
});


const explictTyped: EzRez<number, "DIVIDE_BY_ZERO" | "TOO_BIG_NUMBER" | "SOMETHING_ELSE"> = function divide(a: number, b: number) {
  if (b === 0) return fail({ tag: "DIVIDE_BY_ZERO", message: "Cannot divide by zero" });
  if (a > 100) return fail({ tag: "TOO_BIG_NUMBER", message: "Number exceeds 100" });
  if (a < 0) return fail({ tag: "SOMETHING_ELSE", message: "Negative numbers unsupported" });
  return ok(a / b);
};

// Equivalent annotation using the helper. define remains optional.
const divideWithFailureUnion: (a: number, b: number) => EzRez<number, MathFailure> = easytype;
const zeroFailure: DivideByZeroFailure = fail({
  tag: "DIVIDE_BY_ZERO",
  message: "Cannot divide by zero",
}).failure;

// Native inference also works without an annotation or wrapper.
function divideInferred(a: number, b: number) {
  if (b === 0) return fail({ tag: "DIVIDE_BY_ZERO", message: "Cannot divide by zero" });
  return ok(a / b);
}

// Mix simple tags with a complete failure type when a tag requires extra fields.
type TooBigFailure = EzFailOf<"TOO_BIG_NUMBER"> & { limit: number };
function divideWithLimit(a: number, b: number): EzRez<number, "DIVIDE_BY_ZERO" | TooBigFailure> {
  if (b === 0) return fail({ tag: "DIVIDE_BY_ZERO", message: "Cannot divide by zero" });
  if (a > 100) return fail({ tag: "TOO_BIG_NUMBER", message: "Number exceeds limit", limit: 100 });
  return ok(a / b);
}

const division = divideWithLimit(101, 2);
if (isError(division) && division.failure.tag === "TOO_BIG_NUMBER") {
  division.failure.limit; // number, narrowed by tag
}

const successOnly: EzRez<number> = ok(1);
const nativeErrorCause = fail({
  tag: "GOOD_CAUSE",
  message: "Native error accepted",
  cause: new Error("native error"),
});
const normalizedCause = fail({
  tag: "GOOD_CAUSE",
  message: "Plain snapshot",
  cause: normalizeCause(new Error("native error")),
});

// Intentional errors: hover to inspect diagnostics in the IDE.
const cannotFail: EzRez<number> = fail({ tag: "NOPE", message: "Nope" });
const unknownTag: EzRez<number, "DIVIDE_BY_ZERO"> = fail({ tag: "OTHER", message: "Not allowed" });
const missingLimit: EzRez<number, TooBigFailure> = fail({ tag: "TOO_BIG_NUMBER", message: "Missing limit" });
const legacyDiscriminator = fail({ type: "OLD", message: "Use tag, not type" });
const notAResult = define(() => 1);
const asyncResult = define(async () => ok(1));

void divideWithFailureUnion;
void zeroFailure;
void divideInferred;
void successOnly;
void nativeErrorCause;
void normalizedCause;
void cannotFail;
void unknownTag;
void missingLimit;
void legacyDiscriminator;
void notAResult;
void asyncResult;
