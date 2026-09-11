/**
 * IDE playground: this file intentionally contains TypeScript errors.
 *
 * It is excluded from the package build/typecheck/lint configuration, so open
 * it in your editor to inspect diagnostics without breaking CI. Do not add
 * @ts-expect-error comments: seeing the real errors is the point.
 */
import { define, fail, normalizeCause, ok, type EzRez } from "./src/index.js";

const successOnly: EzRez<number> = ok(1);

// Error: EzRez<number> has an error type of never, so a failure is invalid.
const cannotFail: EzRez<number> = fail({ type: "NOPE", message: "Nope" });

// Error: failure causes are snapshots, not native Error instances.
const nativeErrorCause = fail({
  type: "BAD_CAUSE",
  message: "Normalize native errors first",
  cause: new Error("native error"),
});

const normalizedCause = fail({
  type: "GOOD_CAUSE",
  message: "Plain snapshot",
  cause: normalizeCause(new Error("native error")),
});

// Error: define accepts synchronous functions that return results only.
const notAResult = define(() => 1);
const asyncResult = define(async () => ok(1));

void successOnly;
void cannotFail;
void nativeErrorCause;
void normalizedCause;
void notAResult;
void asyncResult;
