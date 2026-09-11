import { isEzRez } from "./guards.js";
import type { ErrorSnapshot, JsonValue } from "./types.js";

const MAX_DEPTH = 16;
const standardKeys = new Set(["name", "message", "stack", "cause"]);

function marker(reason: string): JsonValue {
  return { $ezrez: reason };
}

function terminal(reason: string): ErrorSnapshot {
  return { name: "NormalizationError", message: reason, cause: null };
}

function read(value: object, key: string): unknown {
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
}

function put(target: Record<string, JsonValue>, key: string, value: JsonValue): void {
  // Define rather than assign so __proto__ remains an ordinary own data field.
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function tag(value: object): string {
  // Object#toString otherwise executes custom Symbol.toStringTag getters.
  // Tagged built-ins (Map, Set, etc.) are outside the supported detail types.
  if (Symbol.toStringTag in value) return "[object Unsupported]";
  return Object.prototype.toString.call(value);
}

function existingSnapshot(value: object): value is ErrorSnapshot {
  const prototype = Object.getPrototypeOf(value);
  const plain = prototype === null || Object.getPrototypeOf(prototype) === null;
  return (
    plain &&
    Object.getOwnPropertyNames(value).every((key) => standardKeys.has(key) || key === "context") &&
    isEzRez({ tag: "snapshot", cause: value })
  );
}

function properties(
  value: object,
  depth: number,
  ancestors: Set<object>,
  exclude: ReadonlySet<string> = new Set(),
): Record<string, JsonValue> {
  const output: Record<string, JsonValue> = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    if (exclude.has(key)) continue;
    let normalized: JsonValue;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      normalized = !descriptor
        ? marker("unreadable")
        : "value" in descriptor
          ? detail(descriptor.value, depth, ancestors)
          : marker("accessor");
    } catch {
      normalized = marker("unreadable");
    }
    put(output, key, normalized);
  }
  return output;
}

function detail(value: unknown, depth: number, ancestors: Set<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? (value === 0 ? 0 : value) : marker("non-finite-number");
  if (typeof value !== "object") return marker(typeof value);
  if (ancestors.has(value)) return marker("circular");
  if (depth >= MAX_DEPTH) return marker("max-depth");
  try {
    const kind = tag(value);
    if (kind === "[object Error]" || existingSnapshot(value)) {
      // ErrorSnapshot contains only JSON-safe data; expose it as an ordinary context value.
      return { ...snapshot(value, depth, ancestors) };
    }
    if (kind === "[object Date]") {
      const time = Date.prototype.getTime.call(value);
      return Number.isFinite(time) ? new Date(time).toISOString() : marker("invalid-date");
    }
    if (kind !== "[object Object]" && !Array.isArray(value)) return marker("unsupported-object");
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        const output: JsonValue[] = [];
        for (let i = 0; i < value.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
          output.push(
            !descriptor
              ? marker("undefined")
              : "value" in descriptor
                ? detail(descriptor.value, depth + 1, ancestors)
                : marker("accessor"),
          );
        }
        return output;
      }
      return properties(value, depth + 1, ancestors);
    } finally {
      ancestors.delete(value);
    }
  } catch {
    return marker("unreadable");
  }
}

function snapshot(value: unknown, depth: number, ancestors: Set<object>): ErrorSnapshot {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return { name: "NonError", message: String(value), cause: null };
  }
  if (ancestors.has(value)) return terminal("circular");
  if (depth >= MAX_DEPTH) return terminal("max-depth");
  ancestors.add(value);
  try {
    const name = read(value, "name");
    const message = read(value, "message");
    const stack = read(value, "stack");
    const cause = read(value, "cause");
    const output: {
      name: string;
      message: string;
      stack?: string;
      cause: ErrorSnapshot | null;
      context?: Record<string, JsonValue>;
    } = {
      name: typeof name === "string" ? name : "NonError",
      message: typeof message === "string" ? message : "Unknown error",
      cause: cause == null ? null : snapshot(cause, depth + 1, ancestors),
    };
    if (typeof stack === "string") output.stack = stack;
    try {
      if (existingSnapshot(value)) {
        const context = read(value, "context");
        if (context !== undefined)
          output.context = properties(context as object, depth + 1, ancestors);
      } else {
        const context = properties(value, depth + 1, ancestors, standardKeys);
        if (Object.keys(context).length > 0) output.context = context;
      }
    } catch {
      output.context = { $ezrez: "unreadable" };
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Takes a fresh JSON/structured-clone-safe snapshot, preserving custom own data
 * fields under context. Unsupported values become informational $ezrez markers.
 * Does not preserve prototypes, references or executable behavior. Depth limit: 16.
 */
export function normalizeCause(value: unknown): ErrorSnapshot | null {
  return value == null ? null : snapshot(value, 0, new Set());
}

/** Normalizes descriptor context without mixing its keys into the Error fields. */
export function normalizeContext(value: object): Readonly<Record<string, JsonValue>> {
  return properties(value, 0, new Set());
}
