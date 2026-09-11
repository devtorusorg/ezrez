import type { AnyResult, ErrorSnapshot } from "./types.js";

export function isSuccess<R extends AnyResult>(
  result: R,
): result is Extract<R, { isSuccess: true }> {
  return result.isSuccess === true;
}

export function isError<R extends AnyResult>(
  result: R,
): result is Extract<R, { isSuccess: false }> {
  return result.isSuccess === false;
}

function object(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function data(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function hasData(value: object, key: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor;
}

/** Iterative traversal avoids stack overflow and rejects cycles, getters and non-JSON values. */
function json(candidate: unknown): boolean {
  const ancestors = new Set<object>();
  const work: { value: unknown; exit?: boolean }[] = [{ value: candidate }];
  while (work.length) {
    const item = work.pop();
    if (!item) break;
    const value = item.value;
    if (value === null || typeof value === "string" || typeof value === "boolean") continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return false;
      continue;
    }
    if (typeof value !== "object") return false;
    if (item.exit) {
      ancestors.delete(value);
      continue;
    }
    if (ancestors.has(value)) return false;
    ancestors.add(value);
    work.push({ value, exit: true });
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (!hasData(value, String(i))) return false;
        work.push({ value: data(value, String(i)) });
      }
    } else {
      const prototype = Object.getPrototypeOf(value);
      // Cross-realm Object prototypes also have a null parent.
      if (prototype !== null && Object.getPrototypeOf(prototype) !== null) return false;
      for (const key of Object.keys(value)) {
        if (!hasData(value, key)) return false;
        work.push({ value: data(value, key) });
      }
    }
  }
  return true;
}

function snapshot(candidate: unknown): candidate is ErrorSnapshot {
  const visited = new Set<object>();
  let current = candidate;
  while (current !== null) {
    if (!object(current) || visited.has(current)) return false;
    visited.add(current);
    if (typeof data(current, "name") !== "string" || typeof data(current, "message") !== "string")
      return false;
    if ("stack" in current && typeof data(current, "stack") !== "string") return false;
    if ("details" in current) {
      const details = data(current, "details");
      if (!object(details) || !json(details)) return false;
    }
    if (!hasData(current, "cause")) return false;
    current = data(current, "cause");
  }
  return true;
}

/** Structural boundary guard only: does not validate application payloads or error tags. */
export function isEzRez(candidate: unknown): candidate is AnyResult {
  try {
    if (!object(candidate)) return false;
    const success = data(candidate, "isSuccess");
    if (success === true) return hasData(candidate, "value") && !("failure" in candidate);
    if (success !== false || "value" in candidate) return false;
    const failure = data(candidate, "failure");
    return (
      object(failure) &&
      typeof data(failure, "type") === "string" &&
      typeof data(failure, "message") === "string" &&
      hasData(failure, "cause") &&
      snapshot(data(failure, "cause"))
    );
  } catch {
    // Revoked proxies and hostile reflection must not escape a boundary guard.
    return false;
  }
}
