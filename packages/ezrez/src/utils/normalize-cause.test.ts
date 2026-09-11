import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { fail, isEzRez } from "../core/index.js";
import { normalizeCause } from "./normalize-cause.js";

function roundTrip(error: unknown) {
  const result = fail({ type: "TEST", message: "Test", cause: normalizeCause(error) });
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  expect(structuredClone(result)).toEqual(result);
  expect(isEzRez(result)).toBe(true);
  expect(isEzRez(JSON.parse(JSON.stringify(result)))).toBe(true);
  return result.failure.cause;
}

describe("normalizeCause", () => {
  it("handles absent, primitive and cross-realm errors", () => {
    expect(normalizeCause(null)).toBeNull();
    expect(normalizeCause(undefined)).toBeNull();
    expect(normalizeCause("oops")).toEqual({ name: "NonError", message: "oops", cause: null });
    for (const value of [
      1,
      false,
      Symbol("x"),
      1n,
      {},
      new Error("oops"),
      runInNewContext("new TypeError('remote')"),
    ])
      roundTrip(value);
    expect(normalizeCause(runInNewContext("new TypeError('remote')"))).toMatchObject({
      name: "TypeError",
      message: "remote",
    });
  });

  it("preserves custom data fields including non-enumerable fields", () => {
    class HttpError extends Error {
      status = 503;
      context = { retryable: true };
      details = { original: true };
      #secret = "not exported";
      getSecret() {
        return this.#secret;
      }
    }
    const error = new HttpError("offline", { cause: new Error("socket") });
    Object.defineProperty(error, "hidden", { value: [1, "two"] });
    Object.defineProperty(error, "__proto__", { value: { safe: true } });
    Object.defineProperty(error, Symbol("ignored"), { value: "ignored" });
    const snapshot = roundTrip(error);
    expect(snapshot).toMatchObject({
      message: "offline",
      cause: { message: "socket" },
      details: {
        status: 503,
        context: { retryable: true },
        details: { original: true },
        hidden: [1, "two"],
      },
    });
    expect(snapshot?.details).toHaveProperty("__proto__", { safe: true });
    expect(snapshot?.details).not.toHaveProperty("getSecret");
    expect(Object.getPrototypeOf(snapshot?.details)).toBe(Object.prototype);
    expect(normalizeCause(snapshot)).toEqual(snapshot);
  });

  it("preserves nested Errors, AggregateErrors, Dates and repeated references", () => {
    const shared = { x: 1 };
    const error = Object.assign(new Error("root"), {
      first: shared,
      second: shared,
      nested: new TypeError("inner"),
      date: new Date("2025-01-01T00:00:00.000Z"),
    });
    expect(roundTrip(error)?.details).toMatchObject({
      first: { x: 1 },
      second: { x: 1 },
      nested: { name: "TypeError", message: "inner" },
      date: "2025-01-01T00:00:00.000Z",
    });
    expect(roundTrip(new AggregateError([new Error("one"), "two"], "many"))?.details).toMatchObject(
      { errors: [{ message: "one" }, "two"] },
    );
  });

  it("uses explicit markers for unsupported custom values", () => {
    const error = Object.assign(new Error("root"), {
      undef: undefined,
      fn: () => 1,
      symbol: Symbol(),
      big: 2n,
      nan: NaN,
      infinity: Infinity,
      map: new Map(),
      invalidDate: new Date(NaN),
      negativeZero: -0,
    });
    expect(roundTrip(error)?.details).toMatchObject({
      undef: { $ezrez: "undefined" },
      fn: { $ezrez: "function" },
      symbol: { $ezrez: "symbol" },
      big: { $ezrez: "bigint" },
      nan: { $ezrez: "non-finite-number" },
      infinity: { $ezrez: "non-finite-number" },
      map: { $ezrez: "unsupported-object" },
      invalidDate: { $ezrez: "invalid-date" },
      negativeZero: 0,
    });
  });

  it("terminates cycles and deeply nested causes/details", () => {
    const error = new Error("cycle");
    error.cause = error;
    expect(roundTrip(error)?.cause).toEqual({
      name: "NormalizationError",
      message: "circular",
      cause: null,
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(roundTrip(Object.assign(new Error("details"), { cyclic }))?.details).toEqual({
      cyclic: { self: { $ezrez: "circular" } },
    });
    let deep: Error = new Error("leaf");
    let detail: unknown = {};
    for (let i = 0; i < 30; i++) {
      deep = new Error("parent", { cause: deep });
      detail = { next: detail };
    }
    expect(JSON.stringify(roundTrip(deep))).toContain("max-depth");
    expect(JSON.stringify(roundTrip(Object.assign(new Error("deep"), { detail })))).toContain(
      "max-depth",
    );
  });

  it("does not execute custom getters or toJSON and contains hostile proxies", () => {
    let calls = 0;
    const error = new Error("safe");
    Object.defineProperty(error, "custom", {
      get() {
        calls++;
        throw new Error("getter");
      },
    });
    Object.assign(error, {
      toJSON() {
        calls++;
        throw new Error("toJSON");
      },
    });
    expect(roundTrip(error)?.details).toEqual({
      custom: { $ezrez: "accessor" },
      toJSON: { $ezrez: "function" },
    });
    const tagged = Object.defineProperty({}, Symbol.toStringTag, {
      get() {
        calls++;
        throw new Error("tag");
      },
    });
    expect(roundTrip(Object.assign(new Error("tagged"), { tagged }))?.details).toEqual({
      tagged: { $ezrez: "unsupported-object" },
    });
    expect(calls).toBe(0);
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("keys");
        },
        get() {
          throw new Error("read");
        },
        getPrototypeOf() {
          throw new Error("proto");
        },
      },
    );
    expect(roundTrip(hostile)?.details).toEqual({ $ezrez: "unreadable" });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    roundTrip(revoked.proxy);
  });
});
