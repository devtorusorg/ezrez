import { describe, expect, it } from "vitest";

import { ezFail, ezOk } from "./core";
import {
  ezCatchDefault,
  ezCatchDefaultAsync,
  ezCatchType,
  ezCatchTypeAsync,
  ezMapFailureType,
  ezOrThen,
  ezTry,
  getBoth,
  getOr,
  getTryOr,
  toEzRez,
  toEzRezAsync,
} from "./methods";

import type { EzRez } from "./types";

describe("sync.ts", () => {
  // Test data for different scenarios
  const successResult = ezOk("success value");
  const networkError = ezFail("NETWORK_ERROR", "Network connection failed");
  type NetworkErrorRez = typeof networkError;
  const validationError = ezFail("VALIDATION_ERROR", "Invalid input", { field: "email" });
  type ValidationErrorRez = typeof validationError;
  const authError = ezFail("AUTH_ERROR", "Unauthorized access", {});
  type AuthErrorRez = typeof authError;
  const unknownError = ezFail("UNKNOWN_ERROR", "Something went wrong");

  describe("ezTry", () => {
    it("should return original ezRez when it is successful", () => {
      const catcher = ezCatchType("NETWORK_ERROR", () => ezOk("recovered"));
      const tryFn = ezTry(catcher);

      const result = tryFn(successResult);

      expect(result).toBe(successResult);
      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe("success value");
      }
    });

    it("should apply the first matching catcher when ezRez fails", () => {
      const catcher = ezCatchType("NETWORK_ERROR", () => ezOk("network recovered"));
      const tryFn = ezTry(catcher);

      const result = tryFn(networkError);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe("network recovered");
      }
    });

    it("should return original ezRez when no catcher matches", () => {
      const catcher = ezCatchType("VALIDATION_ERROR", () => ezOk("recovered"));
      const tryFn = ezTry(catcher);

      const result = tryFn(networkError);

      expect(result).toBe(networkError);
      expect(result.isSuccess).toBe(false);
    });

    it("should work with multiple catchers", () => {
      const networkCatcher = ezCatchType("NETWORK_ERROR", () => ezOk("network fixed"));
      const authCatcher = ezCatchType("AUTH_ERROR", () => ezOk("auth fixed"));
      const tryFn = ezTry(networkCatcher, authCatcher);

      const networkResult = tryFn(networkError);
      const authResult = tryFn(authError);

      expect(networkResult.isSuccess).toBe(true);
      if (networkResult.isSuccess) {
        expect(networkResult.value).toBe("network fixed");
      }

      expect(authResult.isSuccess).toBe(true);
      if (authResult.isSuccess) {
        expect(authResult.value).toBe("auth fixed");
      }
    });

    it("should prioritize the first matching catcher", () => {
      const firstCatcher = ezCatchType("NETWORK_ERROR", () => ezOk("first handler"));
      const secondCatcher = ezCatchType("NETWORK_ERROR", () => ezOk("second handler"));
      const tryFn = ezTry(firstCatcher, secondCatcher);

      const result = tryFn(networkError);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe("first handler");
      }
    });

    it("should work with default catcher as fallback", () => {
      const specificCatcher = ezCatchType("VALIDATION_ERROR", () => ezOk("validation fixed"));
      const defaultCatcher = ezCatchDefault(() => ezOk("default fallback"));
      const tryFn = ezTry(specificCatcher, defaultCatcher);

      const networkResult = tryFn(networkError);
      const validationResult = tryFn(validationError);

      expect(networkResult.isSuccess).toBe(true);
      if (networkResult.isSuccess) {
        expect(networkResult.value).toBe("default fallback");
      }

      expect(validationResult.isSuccess).toBe(true);
      if (validationResult.isSuccess) {
        expect(validationResult.value).toBe("validation fixed");
      }
    });

    it("should handle catcher returning different failure", () => {
      const catcher = ezCatchType("NETWORK_ERROR", () => ezFail("RETRY_ERROR", "Retry failed"));
      const tryFn = ezTry(catcher);

      const result = tryFn(networkError);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.failure.type).toBe("RETRY_ERROR");
        expect(result.failure.message).toBe("Retry failed");
      }
    });

    it("should handle catcher returning different value type", () => {
      // Test transforming from string error to number success
      const numericError = ezFail("PARSE_ERROR", "Could not parse string to number");
      const catcher = ezCatchType("PARSE_ERROR", () => ezOk(42)); // Transform to number
      const tryFn = ezTry(catcher);

      const result = tryFn(numericError);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe(42);
        expect(typeof result.value).toBe("number");
      }
    });

    it("should handle catcher returning complex object type", () => {
      // Test transforming from simple error to complex object
      const dataError = ezFail("DATA_ERROR", "Data processing failed");
      const recoveryData = {
        recovered: true,
        fallbackData: ["item1", "item2"],
        timestamp: Date.now(),
      } as const;

      const catcher = ezCatchType("DATA_ERROR", () => ezOk(recoveryData));
      const tryFn = ezTry(catcher);

      const result = tryFn(dataError);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toEqual(recoveryData);
        if (result.value && "recovered" in result.value) {
          const value = result.value;
          expect(value.recovered).toBe(true);
          expect(Array.isArray(value.fallbackData)).toBe(true);
          expect(value.fallbackData).toHaveLength(2);
        }
      }
    });

    it("should handle multiple failure types and transform to different failure types with proper type narrowing", () => {
      // Test scenario: Multiple input failures transformed to different output failures
      const chooseError = (ind: number) => {
        if (ind === -1) return ezOk(1);
        if (ind === 0) return ezFail("NETWORK_ERROR", "Network connection failed");
        if (ind === 1) return ezFail("DATABASE_ERROR", "Database query failed", { table: "users" });
        return ezFail("AUTH_ERROR", "Authentication failed");
      };

      // Each catcher transforms to a different failure type
      const networkCatcher = ezCatchType("NETWORK_ERROR", () =>
        ezFail("NETWORK_ERROR_EX", "This is NETWORK_ERROR modified", { modified: true }),
      );

      const dbCatcher = ezCatchType("DATABASE_ERROR", () =>
        ezFail("FALLBACK_ERROR", "Using fallback data source"),
      );

      // TypeScript has trouble with multiple catchers returning different failure types
      // So we test them separately to avoid the union type complexity
      const combinedTryFn = ezTry(networkCatcher, dbCatcher); // Works at runtime, TS needs help with multiple output types

      //Test NetworkError transform
      const networkResult = combinedTryFn(chooseError(0));
      expect(networkResult.isSuccess).toBe(false);
      if (!networkResult.isSuccess) {
        expect(networkResult.failure.type).toBe("NETWORK_ERROR_EX");
        if (networkResult.failure.type === "NETWORK_ERROR_EX") {
          expect(networkResult.failure.message).toBe("This is NETWORK_ERROR modified");
          // @ts-expect-error - Type narrowing doesn't work properly for union types with data property
          expect(networkResult.failure.data.modified).toBe(true);
        }
      }
      //Test DatabaseError transform
      const dbResult = combinedTryFn(chooseError(1));
      expect(dbResult.isSuccess).toBe(false);
      if (!dbResult.isSuccess) {
        expect(dbResult.failure.type).toBe("FALLBACK_ERROR");
        expect(dbResult.failure.message).toBe("Using fallback data source");
      }

      // Test uncaught error pass-through using combined function
      const uncaughtResult = combinedTryFn(chooseError(2));
      expect(uncaughtResult.isSuccess).toBe(false);
      if (!uncaughtResult.isSuccess) {
        expect(uncaughtResult.failure.type).toBe("AUTH_ERROR");
        expect(uncaughtResult.failure.message).toBe("Authentication failed");
      }
    });
    it("should handle multiple failure types and transform to different failure & ok results with proper type narrowing", () => {
      // Test scenario: Multiple input failures transformed to different output failures
      const chooseError = (ind: number) => {
        if (ind === 0) return ezFail("NETWORK_ERROR", "Network connection failed");
        if (ind === 1) return ezFail("DATABASE_ERROR", "Database query failed", { table: "users" });
        return ezFail("AUTH_ERROR", "Authentication failed");
      };

      // Each catcher transforms to a different failure type
      const networkCatcher = ezCatchType("NETWORK_ERROR", () =>
        ezFail("NETWORK_ERROR_EX", "This is NETWORK_ERROR modified", { modified: true }),
      );

      const dbCatcher = ezCatchType("DATABASE_ERROR", () => ezOk("Success Fallback"));

      // TypeScript has trouble with multiple catchers returning different failure types
      // So we test them separately to avoid the union type complexity
      const combinedTryFn = ezTry(networkCatcher, dbCatcher); // Works at runtime, TS needs help with multiple output types

      //Test NetworkError transform
      const networkResult = combinedTryFn(chooseError(0));
      expect(networkResult.isSuccess).toBe(false);
      if (!networkResult.isSuccess) {
        expect(networkResult.failure.type).toBe("NETWORK_ERROR_EX");
        if (networkResult.failure.type === "NETWORK_ERROR_EX") {
          expect(networkResult.failure.message).toBe("This is NETWORK_ERROR modified");
          // @ts-expect-error - Type narrowing doesn't work properly for union types with data property
          expect(networkResult.failure.data.modified).toBe(true);
        }
      }
      //Test DatabaseError transform
      const dbResult = combinedTryFn(chooseError(1));
      expect(dbResult.isSuccess).toBe(true);
      if (dbResult.isSuccess) {
        expect(dbResult.value).toBe("Success Fallback");
      }

      // Test uncaught error pass-through using combined function
      const uncaughtResult = combinedTryFn(chooseError(2));
      expect(uncaughtResult.isSuccess).toBe(false);
      if (!uncaughtResult.isSuccess) {
        expect(uncaughtResult.failure.type).toBe("AUTH_ERROR");
        expect(uncaughtResult.failure.message).toBe("Authentication failed");
      }
    });
  });

  describe("rezCatchType", () => {
    it("should create a catcher that filters by type", () => {
      const catcher = ezCatchType("NETWORK_ERROR", () => ezOk("handled"));

      expect(catcher.filter).toBeDefined();
      expect(catcher.handler).toBeDefined();
    });

    it("should match the correct failure type", () => {
      const catcher = ezCatchType<NetworkErrorRez>("NETWORK_ERROR", () => ezOk("handled"));

      const shouldMatch = catcher.filter(networkError.failure);
      // @ts-expect-error - This is testing a runtime check that should be prevented by the type system
      const shouldNotMatch = catcher.filter(validationError.failure);

      expect(shouldMatch).toBe(true);
      expect(shouldNotMatch).toBe(false);
    });

    it("should apply the handler when type matches", () => {
      const handler = (ezRez: any) => ezOk(`handled: ${ezRez.failure.message}`);
      const catcher = ezCatchType("NETWORK_ERROR", handler);

      const result = catcher.handler(networkError);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe("handled: Network connection failed");
      }
    });

    it("should work with failures that have data", () => {
      const handler = (_: any) => ezOk("validation handled");
      const catcher = ezCatchType("VALIDATION_ERROR", handler);

      const shouldMatch = catcher.filter(validationError.failure);
      const result = catcher.handler(validationError);

      expect(shouldMatch).toBe(true);
      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe("validation handled");
      }
    });
  });

  describe("rezCatchDefault", () => {
    it("should create a catcher that matches all failures", () => {
      const catcher = ezCatchDefault<NetworkErrorRez | ValidationErrorRez | AuthErrorRez>(() =>
        ezOk("default handled"),
      );

      const matchesNetwork = catcher.filter(networkError.failure);
      const matchesValidation = catcher.filter(validationError.failure);
      const matchesAuth = catcher.filter(authError.failure);

      expect(matchesNetwork).toBe(true);
      expect(matchesValidation).toBe(true);
      expect(matchesAuth).toBe(true);
    });

    it("should apply the handler for any failure", () => {
      const handler = (ezRez: EzRez<string>) => {
        if (!ezRez.isSuccess) {
          return ezOk(`default handled: ${ezRez.failure.type}`);
        }
        return ezRez;
      };
      const catcher = ezCatchDefault(handler);

      const networkResult = catcher.handler(networkError);
      const validationResult = catcher.handler(validationError);

      expect(networkResult.isSuccess).toBe(true);
      expect(validationResult.isSuccess).toBe(true);

      if (networkResult.isSuccess) {
        expect(networkResult.value).toBe("default handled: NETWORK_ERROR");
      }
      if (validationResult.isSuccess) {
        expect(validationResult.value).toBe("default handled: VALIDATION_ERROR");
      }
    });
  });

  describe("ezOrThen", () => {
    it("should return the original ezRez when successful", () => {
      const handler = () => ezOk("fallback");

      const result = ezOrThen(successResult, handler);

      expect(result).toBe(successResult);
      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe("success value");
      }
    });

    it("should apply handler when ezRez fails", () => {
      const handler = (failure: { type: "NETWORK_ERROR"; message: string }) =>
        ezOk(`handled: ${failure.message}`);

      // @ts-expect-error - Type inference issue with handler parameter type
      const result = ezOrThen(networkError, handler);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe("handled: Network connection failed");
      }
    });

    it("should pass the failure object to the handler", () => {
      const handler = (failure: typeof validationError.failure) => {
        expect(failure.type).toBe("VALIDATION_ERROR");
        expect(failure.message).toBe("Invalid input");
        expect(failure.data).toEqual({ field: "email" });
        return ezOk("validation handled");
      };

      const result = ezOrThen(validationError, handler);

      expect(result.isSuccess).toBe(true);
    });

    it("should allow handler to return another failure", () => {
      const handler = (_failure: { type: "NETWORK_ERROR"; message: string }) =>
        ezFail("HANDLER_ERROR", "Handler failed");

      // @ts-expect-error - Type inference issue with handler parameter type
      const result = ezOrThen(networkError, handler);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect((result as any).failure.type).toBe("HANDLER_ERROR");
        expect((result as any).failure.message).toBe("Handler failed");
      }
    });
  });

  describe("getOr", () => {
    it("should return the value when ezRez is successful", () => {
      const result = getOr(successResult, "default value");

      expect(result).toBe("success value");
    });

    it("should return the orValue when ezRez fails", () => {
      const result = getOr(networkError, "default value");

      expect(result).toBe("default value");
    });

    it("should work with different value types", () => {
      const numberSuccess = ezOk(42);
      const objectDefault = { key: "value" };

      const successResult = getOr(numberSuccess, 0);
      const failureResult = getOr(networkError, objectDefault);

      expect(successResult).toBe(42);
      expect(failureResult).toBe(objectDefault);
    });

    it("should work with special values", () => {
      const stringSuccess = ezOk("special value");
      const fallbackValue = "fallback";

      const result1 = getOr(stringSuccess, "default");
      const result2 = getOr(networkError, fallbackValue);

      expect(result1).toBe("special value");
      expect(result2).toBe("fallback");
    });
  });

  describe("getTryOr", () => {
    it("should return a function that combines rezTry and getOr", () => {
      const catcher = ezCatchType("NETWORK_ERROR", () => ezOk("recovered"));
      const tryOrFn = getTryOr([catcher], "default");

      expect(typeof tryOrFn).toBe("function");
    });

    it("should apply catchers and then getOr logic", () => {
      const networkCatcher = ezCatchType("NETWORK_ERROR", () => ezOk("network recovered"));
      const tryOrFn = getTryOr([networkCatcher], "default");

      const successOutput = tryOrFn(successResult);
      const networkResult = tryOrFn(networkError);
      const authResult = tryOrFn(authError);

      expect(successOutput).toBe("success value"); // Success case
      expect(networkResult).toBe("network recovered"); // Caught and recovered
      expect(authResult).toBe("default"); // Not caught, falls back to default
    });

    it("should work with multiple catchers and fallback value", () => {
      const networkCatcher = ezCatchType("NETWORK_ERROR", () => ezOk("network fixed"));
      const authCatcher = ezCatchType("AUTH_ERROR", () => ezOk("auth fixed"));
      const tryOrFn = getTryOr([networkCatcher, authCatcher], "fallback");

      const networkResult = tryOrFn(networkError);
      const authResult = tryOrFn(authError);
      const unknownResult = tryOrFn(unknownError);

      expect(networkResult).toBe("network fixed");
      expect(authResult).toBe("auth fixed");
      expect(unknownResult).toBe("fallback");
    });

    it("should fallback when catcher returns failure", () => {
      const failingCatcher = ezCatchType("NETWORK_ERROR", () =>
        ezFail("RETRY_ERROR", "Retry failed"),
      );
      const tryOrFn = getTryOr([failingCatcher], "ultimate fallback");

      const result = tryOrFn(networkError);

      expect(result).toBe("ultimate fallback");
    });

    it("should work with empty catchers array", () => {
      const tryOrFn = getTryOr([], "no catchers fallback");

      const successOutput = tryOrFn(successResult);
      const failureResult = tryOrFn(networkError);

      expect(successOutput).toBe("success value");
      expect(failureResult).toBe("no catchers fallback");
    });

    it("should work with default catcher", () => {
      const defaultCatcher = ezCatchDefault(() => ezOk("caught all"));
      const tryOrFn = getTryOr([defaultCatcher], "should not reach here");

      const result = tryOrFn(networkError);

      expect(result).toBe("caught all");
    });
  });

  describe("getBoth", () => {
    it("should return [value, undefined] when ezRez is successful", () => {
      const [value, failure] = getBoth(successResult);

      expect(value).toBe("success value");
      expect(failure).toBeUndefined();
    });

    it("should return [undefined, failure] when ezRez fails", () => {
      const [value, failure] = getBoth(networkError);

      expect(value).toBeUndefined();
      expect(failure).toBeDefined();
      expect(failure).toEqual(networkError.failure);
    });

    it("should return correct types for complex value types", () => {
      const complexValue = {
        data: [1, 2, 3],
        metadata: { created: new Date(), id: "abc123" },
        isValid: true,
      };
      const complexSuccess = ezOk(complexValue);

      const [value, failure] = getBoth(complexSuccess);

      expect(value).toEqual(complexValue);
      expect(failure).toBeUndefined();
      expect(value?.data).toEqual([1, 2, 3]);
      expect(value?.isValid).toBe(true);
    });

    it("should return correct failure object for failures with data", () => {
      const [value, failure] = getBoth(validationError);

      expect(value).toBeUndefined();
      expect(failure).toBeDefined();
      expect(failure?.type).toBe("VALIDATION_ERROR");
      expect(failure?.message).toBe("Invalid input");
      expect(failure?.data).toEqual({ field: "email" });
    });

    it("should return correct failure object for failures without data", () => {
      const [value, failure] = getBoth(authError);

      expect(value).toBeUndefined();
      expect(failure).toBeDefined();
      expect(failure?.type).toBe("AUTH_ERROR");
      expect(failure?.message).toBe("Unauthorized access");
      expect(failure?.data).toEqual({});
    });

    it("should work with null and undefined values", () => {
      const nullSuccess = ezOk(null);
      const undefinedSuccess = ezOk(undefined);

      const [nullValue, nullFailure] = getBoth(nullSuccess);
      const [undefinedValue, undefinedFailure] = getBoth(undefinedSuccess);

      expect(nullValue).toBe(null);
      expect(nullFailure).toBeUndefined();
      expect(undefinedValue).toBeUndefined();
      expect(undefinedFailure).toBeUndefined();
    });

    it("should work with primitive value types", () => {
      const numberSuccess = ezOk(42);
      const booleanSuccess = ezOk(false);
      const stringSuccess = ezOk("");

      const [numberValue, numberFailure] = getBoth(numberSuccess);
      const [booleanValue, booleanFailure] = getBoth(booleanSuccess);
      const [stringValue, stringFailure] = getBoth(stringSuccess);

      expect(numberValue).toBe(42);
      expect(numberFailure).toBeUndefined();
      expect(booleanValue).toBe(false);
      expect(booleanFailure).toBeUndefined();
      expect(stringValue).toBe("");
      expect(stringFailure).toBeUndefined();
    });

    it("should maintain type safety with tuple destructuring", () => {
      // Test that the function returns the correct tuple structure
      const result = getBoth(successResult);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);

      // Verify tuple positions
      const [firstElement, secondElement] = result;
      expect(firstElement).toBe("success value");
      expect(secondElement).toBeUndefined();
    });
  });

  describe("toEzRez", () => {
    it("should wrap successful callback and return EzRezOk", () => {
      const callback = () => "successful result";

      const result = toEzRez(callback);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe("successful result");
      }
    });

    it("should catch exceptions and return default RuntimeError", () => {
      const callback = () => {
        throw new Error("Something went wrong");
      };

      const result = toEzRez(callback);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.failure.type).toBe("RuntimeError");
        expect(result.failure.message).toBe("Something went wrong");
        expect(result.failure.data.error).toBeInstanceOf(Error);
      }
    });

    it("should catch non-Error exceptions and return RuntimeError", () => {
      const callback = () => {
        //eslint-disable-next-line @typescript-eslint/only-throw-error
        throw { msg: "This is not an actual Error" };
      };

      const result = toEzRez(callback);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.failure.type).toBe("RuntimeError");
        expect(result.failure.message).toBe("Unknown error");
        expect(result.failure.data.error).not.toBeInstanceOf(Error);
      }
    });

    it("should catch non-Error exceptions and return RuntimeError and extract message attribute", () => {
      const callback = () => {
        //eslint-disable-next-line @typescript-eslint/only-throw-error
        throw { message: "Custom object message" };
      };

      const result = toEzRez(callback);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.failure.type).toBe("RuntimeError");
        expect(result.failure.message).toBe("Custom object message");
        expect(result.failure.data.error).not.toBeInstanceOf(Error);
      }
    });

    it("should use custom catcher when provided", () => {
      const callback = () => {
        throw new Error("Custom error");
      };

      const customCatcher = (error: unknown) =>
        ezFail("CUSTOM_ERROR", "This is a custom error", { originalError: error });

      const result = toEzRez(callback, customCatcher);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.failure.type).toBe("CUSTOM_ERROR");
        expect(result.failure.message).toBe("This is a custom error");
        expect(result.failure.data.originalError).toBeInstanceOf(Error);
      }
    });

    it("should work with different return value types", () => {
      const numberCallback = () => 42;
      const objectCallback = () => ({ key: "value", items: [1, 2, 3] });
      const booleanCallback = () => true;
      const nullCallback = () => null;

      const numberResult = toEzRez(numberCallback);
      const objectResult = toEzRez(objectCallback);
      const booleanResult = toEzRez(booleanCallback);
      const nullResult = toEzRez(nullCallback);

      expect(numberResult.isSuccess).toBe(true);
      if (numberResult.isSuccess) expect(numberResult.value).toBe(42);

      expect(objectResult.isSuccess).toBe(true);
      if (objectResult.isSuccess) {
        expect(objectResult.value).toEqual({ key: "value", items: [1, 2, 3] });
      }

      expect(booleanResult.isSuccess).toBe(true);
      if (booleanResult.isSuccess) expect(booleanResult.value).toBe(true);

      expect(nullResult.isSuccess).toBe(true);
      if (nullResult.isSuccess) expect(nullResult.value).toBe(null);
    });

    it("should handle complex custom catcher scenarios", () => {
      const callback = () => {
        const error = new Error("Network timeout");
        (error as any).code = "TIMEOUT";
        throw error;
      };

      const networkCatcher = (error: unknown) => {
        if (error instanceof Error && (error as Error & { code: string }).code === "TIMEOUT") {
          return ezFail("NETWORK_TIMEOUT", "Request timed out", {
            code: (error as Error & { code: string }).code,
            originalMessage: error.message,
          });
        }
        return ezFail("NETWORK_TIMEOUT", "Unknown network error", {
          code: "UNKNOWN",
          originalMessage: "Unknown error",
        });
      };

      const result = toEzRez(callback, networkCatcher);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.failure.type).toBe("NETWORK_TIMEOUT");
        expect(result.failure.message).toBe("Request timed out");
        expect((result.failure.data as any).code).toBe("TIMEOUT");
        expect((result.failure.data as any).originalMessage).toBe("Network timeout");
      }
    });

    it("should handle catcher that transforms different error types", () => {
      const typeErrorCallback = () => {
        throw new TypeError("Type error occurred");
      };

      const rangeErrorCallback = () => {
        throw new RangeError("Range error occurred");
      };

      const errorTypeCatcher = (error: unknown) => {
        if (error instanceof TypeError) {
          return ezFail("TYPE_ERROR", "Invalid type", { errorType: "TypeError" });
        }
        if (error instanceof RangeError) {
          return ezFail("RANGE_ERROR", "Out of range", { errorType: "RangeError" });
        }
        return ezFail("GENERIC_ERROR", "Generic error", { errorType: "Unknown" });
      };

      // @ts-expect-error - Type inference issue with error catcher returning union types
      const typeResult = toEzRez(typeErrorCallback, errorTypeCatcher);
      // @ts-expect-error - Type inference issue with error catcher returning union types
      const rangeResult = toEzRez(rangeErrorCallback, errorTypeCatcher);

      expect(typeResult.isSuccess).toBe(false);
      if (!typeResult.isSuccess) {
        expect(typeResult.failure.type).toBe("TYPE_ERROR");
        expect(typeResult.failure.data.errorType).toBe("TypeError");
      }

      expect(rangeResult.isSuccess).toBe(false);
      if (!rangeResult.isSuccess) {
        expect(rangeResult.failure.type).toBe("RANGE_ERROR");
        expect(rangeResult.failure.data.errorType).toBe("RangeError");
      }
    });

    it("should handle async-like patterns (though function is sync)", () => {
      // Test callbacks that return promises (but are handled synchronously)
      const promiseCallback = () => {
        return Promise.resolve("promise value");
      };

      const result = toEzRez(promiseCallback);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBeInstanceOf(Promise);
      }
    });

    it("should handle callbacks with side effects", () => {
      let sideEffectValue = "initial";

      const sideEffectCallback = () => {
        sideEffectValue = "modified";
        return "callback result";
      };

      const result = toEzRez(sideEffectCallback);

      expect(sideEffectValue).toBe("modified");
      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe("callback result");
      }
    });

    it("should preserve Error properties in default catcher", () => {
      const callback = () => {
        const error = new Error("Detailed error");
        (error as any).statusCode = 500;
        (error as any).details = { foo: "bar" };
        throw error;
      };

      const result = toEzRez(callback);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.failure.type).toBe("RuntimeError");
        expect(result.failure.data.error).toBeInstanceOf(Error);
        const originalError = result.failure.data.error as Error & {
          statusCode: number;
          details: any;
        };
        expect(originalError.statusCode).toBe(500);
        expect(originalError.details).toEqual({ foo: "bar" });
      }
    });
  });

  describe("ezMapFailureType", () => {
    it("should return undefined when successful and no success value provided", () => {
      const result = ezMapFailureType(successResult, {
        NETWORK_ERROR: (failure: any) => `Network: ${failure.message}`,
      } as any);

      expect(result).toBeUndefined();
    });

    it("should return the success value when successful and success value provided", () => {
      const result = ezMapFailureType(
        successResult,
        {
          NETWORK_ERROR: (failure: any) => `Network: ${failure.message}`,
        } as any,
        "custom success value",
      );

      expect(result).toBe("custom success value");
    });

    it("should map a failure to a value using the matching mapper", () => {
      const result = ezMapFailureType(networkError, {
        NETWORK_ERROR: (failure: any) => `Network failed: ${failure.message}`,
      });

      expect(result).toBe("Network failed: Network connection failed");
    });

    it("should return undefined when no mapper matches the failure type", () => {
      const result = ezMapFailureType(networkError, {
        VALIDATION_ERROR: (failure: any) => `Validation: ${failure.message}`,
      } as any);

      expect(result).toBeUndefined();
    });

    it("should work with multiple failure types", () => {
      const mapObj = {
        NETWORK_ERROR: (failure: any) => `Network: ${failure.message}`,
        VALIDATION_ERROR: (failure: any) => `Validation: ${failure.message}`,
        AUTH_ERROR: (failure: any) => `Auth: ${failure.message}`,
      };

      const networkResult = ezMapFailureType(networkError, mapObj as any);
      const validationResult = ezMapFailureType(validationError, mapObj as any);
      const authResult = ezMapFailureType(authError, mapObj as any);

      expect(networkResult).toBe("Network: Network connection failed");
      expect(validationResult).toBe("Validation: Invalid input");
      expect(authResult).toBe("Auth: Unauthorized access");
    });

    it("should work with failures that have data", () => {
      const result = ezMapFailureType(validationError, {
        VALIDATION_ERROR: (failure: any) => ({
          errorType: failure.type,
          field: failure.data.field,
          message: failure.message,
        }),
      });

      expect(result).toEqual({
        errorType: "VALIDATION_ERROR",
        field: "email",
        message: "Invalid input",
      });
    });

    it("should map to different value types", () => {
      // Map to string
      const stringResult = ezMapFailureType(networkError, {
        NETWORK_ERROR: () => "error string",
      });
      expect(stringResult).toBe("error string");

      // Map to number
      const numberResult = ezMapFailureType(networkError, {
        NETWORK_ERROR: () => 404,
      });
      expect(numberResult).toBe(404);

      // Map to boolean
      const booleanResult = ezMapFailureType(networkError, {
        NETWORK_ERROR: () => false,
      });
      expect(booleanResult).toBe(false);

      // Map to object
      const objectResult = ezMapFailureType(networkError, {
        NETWORK_ERROR: () => ({ status: "error", code: 500 }),
      });
      expect(objectResult).toEqual({ status: "error", code: 500 });

      // Map to array
      const arrayResult = ezMapFailureType(networkError, {
        NETWORK_ERROR: () => ["error1", "error2"],
      });
      expect(arrayResult).toEqual(["error1", "error2"]);

      // Map to null
      const nullResult = ezMapFailureType(networkError, {
        NETWORK_ERROR: () => null,
      });
      expect(nullResult).toBe(null);
    });

    it("should allow mapper to access failure data", () => {
      const dbError = ezFail("DATABASE_ERROR", "Query failed", {
        query: "SELECT * FROM users",
        table: "users",
        errorCode: 1062,
      });

      const result = ezMapFailureType(dbError, {
        DATABASE_ERROR: (failure: any) => ({
          summary: `Database error on table: ${failure.data.table}`,
          details: {
            query: failure.data.query,
            code: failure.data.errorCode,
            message: failure.message,
          },
        }),
      });

      expect(result).toEqual({
        summary: "Database error on table: users",
        details: {
          query: "SELECT * FROM users",
          code: 1062,
          message: "Query failed",
        },
      });
    });

    it("should work with partial mapping object", () => {
      // Only some failure types are mapped
      const partialMap = {
        NETWORK_ERROR: () => "Network mapped",
        // AUTH_ERROR is not mapped
      };

      const networkResult = ezMapFailureType(networkError, partialMap);
      const authResult = ezMapFailureType(authError, partialMap as any);

      expect(networkResult).toBe("Network mapped");
      expect(authResult).toBeUndefined();
    });

    it("should handle complex error transformation scenarios", () => {
      const apiError = ezFail("API_ERROR", "API request failed", {
        statusCode: 500,
        endpoint: "/api/users",
        retryable: true,
      });

      const result = ezMapFailureType(apiError, {
        API_ERROR: (failure: any) => {
          if (failure.data.statusCode === 404) {
            return { error: "Not Found", retry: false };
          }
          if (failure.data.statusCode === 500 && failure.data.retryable) {
            return { error: "Server Error", retry: true, endpoint: failure.data.endpoint };
          }
          return { error: "Unknown API Error", retry: false };
        },
      });

      expect(result).toEqual({
        error: "Server Error",
        retry: true,
        endpoint: "/api/users",
      });
    });

    it("should work in combination with other ezRez functions", () => {
      // Use ezTry first, then map any remaining failures
      const catcher = ezCatchType("VALIDATION_ERROR", () => ezOk("validation recovered"));
      const tryFn = ezTry(catcher);

      const networkResult = tryFn(networkError);
      const validationResult = tryFn(validationError);

      // Map the network error (not caught)
      const networkMapped = ezMapFailureType(networkResult, {
        NETWORK_ERROR: () => "Network error mapped",
      });

      // Validation was recovered, so should be success (returns undefined without success value)
      const validationMapped = ezMapFailureType(validationResult, {
        NETWORK_ERROR: () => "Should not execute",
      });

      // With success value provided
      const validationMappedWithSuccess = ezMapFailureType(
        validationResult,
        {
          NETWORK_ERROR: () => "Should not execute",
        },
        "Success handled",
      );

      expect(networkMapped).toBe("Network error mapped");
      expect(validationMapped).toBeUndefined();
      expect(validationMappedWithSuccess).toBe("Success handled");
      expect(validationResult.isSuccess).toBe(true);
    });

    it("should work with union types of multiple error results", () => {
      const chooseError = (type: "network" | "auth" | "validation") => {
        if (type === "network") return networkError;
        if (type === "auth") return authError;
        return validationError;
      };

      const errorMapper = {
        NETWORK_ERROR: () => "network-fallback",
        AUTH_ERROR: () => "auth-fallback",
        VALIDATION_ERROR: () => "validation-fallback",
      };

      const networkResult = ezMapFailureType(chooseError("network"), errorMapper);
      const authResult = ezMapFailureType(chooseError("auth"), errorMapper);
      const validationResult = ezMapFailureType(chooseError("validation"), errorMapper);

      expect(networkResult).toBe("network-fallback");
      expect(authResult).toBe("auth-fallback");
      expect(validationResult).toBe("validation-fallback");
    });

    it("should handle empty mapping object", () => {
      const result = ezMapFailureType(networkError, {});

      expect(result).toBeUndefined();
    });

    it("should allow mapping to EzRez results", () => {
      const result: any = ezMapFailureType(networkError, {
        NETWORK_ERROR: () => ezOk("recovered value"),
      });

      expect(result).toBeDefined();
      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe("recovered value");
    });

    it("should allow mapping failures to other failures", () => {
      const result: any = ezMapFailureType(networkError, {
        NETWORK_ERROR: (failure: any) =>
          ezFail("NETWORK_ERROR_TRANSFORMED", `Transformed: ${failure.message}`),
      });

      expect(result).toBeDefined();
      expect(result.isSuccess).toBe(false);
      expect(result.failure.type).toBe("NETWORK_ERROR_TRANSFORMED");
      expect(result.failure.message).toBe("Transformed: Network connection failed");
    });

    it("should work with complex nested data structures", () => {
      const complexError = ezFail("COMPLEX_ERROR", "Complex failure", {
        nested: {
          level1: {
            level2: {
              data: "deep value",
              array: [1, 2, 3],
            },
          },
        },
        metadata: {
          timestamp: Date.now(),
          userId: 123,
        },
      });

      const result = ezMapFailureType(complexError, {
        COMPLEX_ERROR: (failure: any) => ({
          deepData: failure.data.nested.level1.level2.data,
          arraySum: failure.data.nested.level1.level2.array.reduce(
            (a: number, b: number) => a + b,
            0,
          ),
          userId: failure.data.metadata.userId,
        }),
      });

      expect(result).toEqual({
        deepData: "deep value",
        arraySum: 6,
        userId: 123,
      });
    });

    it("should handle success value of different types", () => {
      // String success value
      const stringResult = ezMapFailureType(
        successResult,
        { NETWORK_ERROR: () => "error" } as any,
        "success string",
      );
      expect(stringResult).toBe("success string");

      // Number success value
      const numberResult = ezMapFailureType(
        successResult,
        { NETWORK_ERROR: () => "error" } as any,
        200,
      );
      expect(numberResult).toBe(200);

      // Object success value
      const objectResult = ezMapFailureType(
        successResult,
        { NETWORK_ERROR: () => "error" } as any,
        {
          status: "ok",
          code: 200,
        },
      );
      expect(objectResult).toEqual({ status: "ok", code: 200 });

      // Boolean success value
      const boolResult = ezMapFailureType(
        successResult,
        { NETWORK_ERROR: () => "error" } as any,
        true,
      );
      expect(boolResult).toBe(true);

      // Null success value
      const nullResult = ezMapFailureType(
        successResult,
        { NETWORK_ERROR: () => "error" } as any,
        null,
      );
      expect(nullResult).toBe(null);

      // Array success value
      const arrayResult = ezMapFailureType(
        successResult,
        { NETWORK_ERROR: () => "error" } as any,
        [1, 2, 3],
      );
      expect(arrayResult).toEqual([1, 2, 3]);
    });

    it("should work as a complete mapper for both success and failure", () => {
      // Map both success and failures to consistent format
      const mapToStatus = (ezRez: typeof successResult | typeof networkError) =>
        ezMapFailureType(
          ezRez,
          {
            NETWORK_ERROR: () => ({ status: "error", type: "network" }),
          },
          { status: "ok", data: "everything is fine" },
        );

      const successMapped = mapToStatus(successResult);
      const failureMapped = mapToStatus(networkError);

      expect(successMapped).toEqual({ status: "ok", data: "everything is fine" });
      expect(failureMapped).toEqual({ status: "error", type: "network" });
    });

    it("should accept simple values instead of mapper functions", () => {
      // String value
      const stringResult = ezMapFailureType(networkError, {
        NETWORK_ERROR: "Network error occurred",
      });
      expect(stringResult).toBe("Network error occurred");

      // Number value
      const numberResult = ezMapFailureType(networkError, {
        NETWORK_ERROR: 404,
      });
      expect(numberResult).toBe(404);

      // Object value
      const objectResult = ezMapFailureType(networkError, {
        NETWORK_ERROR: { error: "network", code: 500 },
      });
      expect(objectResult).toEqual({ error: "network", code: 500 });

      // Boolean value
      const boolResult = ezMapFailureType(authError, {
        AUTH_ERROR: false,
      } as any);
      expect(boolResult).toBe(false);

      // Null value
      const nullResult = ezMapFailureType(networkError, {
        NETWORK_ERROR: null,
      });
      expect(nullResult).toBe(null);

      // Array value
      const arrayResult = ezMapFailureType(networkError, {
        NETWORK_ERROR: ["error", "network"],
      });
      expect(arrayResult).toEqual(["error", "network"]);
    });

    it("should support mixing simple values and mapper functions", () => {
      const result1 = ezMapFailureType(networkError, {
        NETWORK_ERROR: "simple network error",
        VALIDATION_ERROR: (failure: any) => `validation: ${failure.message}`,
      } as any);
      expect(result1).toBe("simple network error");

      const result2 = ezMapFailureType(validationError, {
        NETWORK_ERROR: "simple network error",
        VALIDATION_ERROR: (failure: any) => `validation: ${failure.message}`,
      } as any);
      expect(result2).toBe("validation: Invalid input");
    });

    it("should use default mapper when failure type is not handled", () => {
      // Default as simple value
      const result1 = ezMapFailureType(networkError, {
        VALIDATION_ERROR: "validation error",
        default: "default error message",
      } as any);
      expect(result1).toBe("default error message");

      // Default as function
      const result2 = ezMapFailureType(networkError, {
        VALIDATION_ERROR: "validation error",
        default: (failure: any) => `unhandled: ${failure.type}`,
      } as any);
      expect(result2).toBe("unhandled: NETWORK_ERROR");

      // Default with access to failure data
      const result3 = ezMapFailureType(networkError, {
        AUTH_ERROR: "auth error",
        default: (failure: any) => ({
          type: failure.type,
          message: failure.message,
          handled: false,
        }),
      } as any);
      expect(result3).toEqual({
        type: "NETWORK_ERROR",
        message: "Network connection failed",
        handled: false,
      });
    });

    it("should prioritize specific handler over default", () => {
      const result = ezMapFailureType(networkError, {
        NETWORK_ERROR: "specific network handler",
        default: "should not be used",
      });
      expect(result).toBe("specific network handler");
    });

    it("should work with default and multiple specific handlers", () => {
      const mapObj = {
        NETWORK_ERROR: "network",
        VALIDATION_ERROR: (failure: any) => `validation: ${failure.message}`,
        default: "unknown error",
      };

      const networkResult = ezMapFailureType(networkError, mapObj);
      const validationResult = ezMapFailureType(validationError, mapObj as any);
      const authResult = ezMapFailureType(authError, mapObj as any);
      const unknownResult = ezMapFailureType(unknownError, mapObj as any);

      expect(networkResult).toBe("network");
      expect(validationResult).toBe("validation: Invalid input");
      expect(authResult).toBe("unknown error");
      expect(unknownResult).toBe("unknown error");
    });

    it("should return undefined when no handler and no default", () => {
      const result = ezMapFailureType(networkError, {
        VALIDATION_ERROR: "validation",
      } as any);
      expect(result).toBeUndefined();
    });

    it("should work with default as object value", () => {
      const defaultValue = { status: "error", type: "unhandled" };
      const result = ezMapFailureType(networkError, {
        VALIDATION_ERROR: "validation",
        default: defaultValue,
      } as any);
      expect(result).toBe(defaultValue);
      expect(result).toEqual({ status: "error", type: "unhandled" });
    });

    it("should allow default to return different types based on failure", () => {
      const result1 = ezMapFailureType(networkError, {
        default: (failure: any) => {
          if (failure.type === "NETWORK_ERROR") return 503;
          if (failure.type === "AUTH_ERROR") return 401;
          return 500;
        },
      } as any);
      expect(result1).toBe(503);

      const result2 = ezMapFailureType(authError, {
        default: (failure: any) => {
          if (failure.type === "NETWORK_ERROR") return 503;
          if (failure.type === "AUTH_ERROR") return 401;
          return 500;
        },
      } as any);
      expect(result2).toBe(401);
    });

    it("should work with all features combined", () => {
      // Test all features: success value, simple values, functions, and default
      const mapToHttpResponse = (ezRez: any) =>
        ezMapFailureType(
          ezRez,
          {
            NETWORK_ERROR: { status: 503, message: "Service unavailable" },
            VALIDATION_ERROR: (failure: any) => ({
              status: 400,
              message: `Bad request: ${failure.message}`,
              field: failure.data?.field,
            }),
            AUTH_ERROR: { status: 401, message: "Unauthorized" },
            default: (failure: any) => ({
              status: 500,
              message: `Internal error: ${failure.type}`,
            }),
          },
          { status: 200, message: "OK" },
        );

      const successResponse = mapToHttpResponse(successResult);
      expect(successResponse).toEqual({ status: 200, message: "OK" });

      const networkResponse = mapToHttpResponse(networkError);
      expect(networkResponse).toEqual({ status: 503, message: "Service unavailable" });

      const validationResponse = mapToHttpResponse(validationError);
      expect(validationResponse).toEqual({
        status: 400,
        message: "Bad request: Invalid input",
        field: "email",
      });

      const authResponse = mapToHttpResponse(authError);
      expect(authResponse).toEqual({ status: 401, message: "Unauthorized" });

      const unknownResponse = mapToHttpResponse(unknownError);
      expect(unknownResponse).toEqual({ status: 500, message: "Internal error: UNKNOWN_ERROR" });
    });
  });

  describe("integration scenarios", () => {
    it("should handle complex error recovery scenarios", () => {
      // Simulate a scenario where we try to recover from network errors,
      // but if that specific recovery fails, we have a default fallback
      const networkRecovery = ezCatchType("NETWORK_ERROR", () =>
        ezOk("network recovery attempted"),
      );
      const defaultRecovery = ezCatchDefault(() => ezOk("default recovery"));

      const tryFn = ezTry(networkRecovery, defaultRecovery);
      const result = tryFn(networkError);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe("network recovery attempted");
      }
    });

    it("should compose multiple sync functions", () => {
      const networkCatcher = ezCatchType("NETWORK_ERROR", () => ezOk("network handled"));
      const tryFn = ezTry(networkCatcher);

      // First try to catch network errors
      const step1 = tryFn(networkError);

      // Then use rezOrThen for additional processing
      const step2 = ezOrThen(step1, () => ezOk("should not execute"));

      // Finally use getOr for extraction
      const step3 = getOr(step2, "should not be needed");

      expect(step3).toBe("network handled");
    });

    it("should handle nested error types", () => {
      const dbError = (throwErr: boolean) => {
        return throwErr
          ? ezFail("DATABASE_ERROR", "Query failed", { query: "SELECT *", table: "users" })
          : ezOk("Success");
      };
      type dbErrorRez = ReturnType<typeof dbError>;

      const dbCatcher = ezCatchType<dbErrorRez>("DATABASE_ERROR", (ezRez) => {
        if (!ezRez.isSuccess && ezRez.failure.data) {
          return ezOk(`DB recovery for table: ${ezRez.failure.data.table}`);
        }
        // return ezFail({ type: 'DB recovery', message: 'DB recovery' });
        return ezOk("DB recovery");
      });
      type dbCatcherRez = typeof dbCatcher;

      const result = ezTry<dbErrorRez, dbCatcherRez>(dbCatcher)(dbError(true));

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe("DB recovery for table: users");
      }
    });

    it("should compose ezGet with other functions for advanced error handling", () => {
      // Scenario: Use ezGet to destructure results and handle them appropriately
      const networkCatcher = ezCatchType("NETWORK_ERROR", () => ezOk("network recovered"));
      const tryFn = ezTry(networkCatcher);

      const processedResult = tryFn(networkError);
      const [value, failure] = getBoth(processedResult);

      expect(value).toBe("network recovered");
      expect(failure).toBeUndefined();

      // Test with unrecovered error
      const unrecoveredResult = tryFn(authError);
      const [unrecoveredValue, unrecoveredFailure] = getBoth(unrecoveredResult);

      expect(unrecoveredValue).toBeUndefined();
      expect(unrecoveredFailure?.type).toBe("AUTH_ERROR");
    });

    it("should use toEzRez with other functions for comprehensive error handling", () => {
      // Scenario: Wrap potentially throwing operations and then apply error handling
      const catcher = ezCatchType("RuntimeError", () => ezOk("Handled random failure"));
      const tryFn = ezTry(catcher);

      // Since it's random, we'll test both success and failure scenarios separately
      const successTest = () => {
        const successResult = toEzRez(() => "guaranteed success");
        const finalResult = tryFn(successResult);
        const [value, failure] = getBoth(finalResult);

        expect(value).toBe("guaranteed success");
        expect(failure).toBeUndefined();
      };

      const failureTest = () => {
        const failureResult = toEzRez(() => {
          throw new Error("guaranteed failure");
        });
        const finalResult = tryFn(failureResult);
        const [value, failure] = getBoth(finalResult);

        expect(value).toBe("Handled random failure");
        expect(failure).toBeUndefined();
      };

      successTest();
      failureTest();
    });

    it("should create complex error handling pipelines", () => {
      // Scenario: Complex pipeline with toEzRez, ezTry, ezOrThen, and ezGet
      const parseNumber = (str: string) => {
        const num = parseInt(str, 10);
        if (isNaN(num)) {
          throw new Error(`Cannot parse "${str}" as number`);
        }
        return num;
      };

      const customCatcher = (error: unknown) =>
        ezFail("PARSE_ERROR", "Failed to parse string", { originalError: error });

      // Step 1: Wrap the parsing operation
      const parseResult = toEzRez(() => parseNumber("invalid"), customCatcher);

      // Step 2: Try to recover from parse errors
      const parseCatcher = ezCatchType("PARSE_ERROR", () => ezOk(0)); // Default to 0
      const recoveredResult = ezTry(parseCatcher)(parseResult);

      // Step 3: Handle any remaining errors with ezOrThen
      const finalResult = ezOrThen(recoveredResult, () => ezOk(-1)); // Ultimate fallback

      // Step 4: Extract the final value
      const [finalValue, finalFailure] = getBoth(finalResult);

      expect(finalValue).toBe(0); // Should recover to 0
      expect(finalFailure).toBeUndefined();
    });

    it("should handle chained operations with mixed success and failure", () => {
      const operations = [
        { name: "op1", shouldSucceed: true, value: "first" },
        { name: "op2", shouldSucceed: false, error: "second failed" },
        { name: "op3", shouldSucceed: true, value: "third" },
      ];

      const results = operations.map((op) => {
        return toEzRez(() => {
          if (!op.shouldSucceed) {
            throw new Error(op.error || "unknown error");
          }
          return op.value;
        });
      });

      // Process each result with error handling
      const fallbackCatcher = ezCatchType("RuntimeError", (ezRez) => {
        return ezOk(`recovered: ${ezRez.failure.message}`);
      });
      const tryFn = ezTry(fallbackCatcher);

      const processedResults = results.map((result) => {
        const processed = tryFn(result);
        return getBoth(processed);
      });

      // Verify results
      expect(processedResults[0][0]).toBe("first");
      expect(processedResults[0][1]).toBeUndefined();

      expect(processedResults[1][0]).toBe("recovered: second failed");
      expect(processedResults[1][1]).toBeUndefined();

      expect(processedResults[2][0]).toBe("third");
      expect(processedResults[2][1]).toBeUndefined();
    });

    it("should demonstrate comprehensive real-world usage pattern", () => {
      // Real-world scenario: API call with parsing, validation, and fallbacks
      const mockApiCall = (shouldFail: boolean) => {
        if (shouldFail) {
          throw new Error("Network timeout");
        }
        return '{"data": {"id": 123, "name": "John"}}';
      };

      const parseJson = (jsonStr: string): any => {
        try {
          return JSON.parse(jsonStr);
        } catch {
          throw new Error("Invalid JSON");
        }
      };

      const validateUser = (userData: any): { id: number; name: string } => {
        if (!userData.data || !userData.data.id || !userData.data.name) {
          throw new Error("Invalid user data structure");
        }
        return userData.data;
      };

      // Error handlers
      const networkCatcher = (error: unknown) =>
        ezFail("NETWORK_ERROR", "API call failed", { error });
      const parseCatcher = (error: unknown) =>
        ezFail("PARSE_ERROR", "JSON parsing failed", { error });
      const validationCatcher = (error: unknown) =>
        ezFail("VALIDATION_ERROR", "Data validation failed", { error });

      // Error recovery strategies
      const networkRecovery = ezCatchType("NETWORK_ERROR", () =>
        ezOk({ id: 0, name: "Anonymous" }),
      );
      const parseRecovery = ezCatchType("PARSE_ERROR", () => ezOk({ id: -1, name: "ParseError" }));
      const validationRecovery = ezCatchType("VALIDATION_ERROR", () =>
        ezOk({ id: -2, name: "ValidationError" }),
      );

      const fullPipeline = (shouldFail: boolean) => {
        // Step 1: API call
        const apiResult = toEzRez(() => mockApiCall(shouldFail), networkCatcher);
        if (!apiResult.isSuccess) {
          return ezTry(networkRecovery)(apiResult);
        }

        // Step 2: Parse JSON
        const parseResult = toEzRez(() => parseJson(apiResult.value), parseCatcher);
        if (!parseResult.isSuccess) {
          return ezTry(parseRecovery)(parseResult);
        }

        // Step 3: Validate structure
        const validateResult = toEzRez(() => validateUser(parseResult.value), validationCatcher);
        if (!validateResult.isSuccess) {
          return ezTry(validationRecovery)(validateResult);
        }

        return validateResult;
      };

      // Test successful flow
      const successResult = fullPipeline(false);
      const successTuple = getBoth(successResult);
      expect(successTuple[0]).toEqual({ id: 123, name: "John" });
      expect(successTuple[1]).toBeUndefined();

      // Test network failure flow
      const failureResult = fullPipeline(true);
      const failureTuple = getBoth(failureResult);
      expect(failureTuple[0]).toEqual({ id: 0, name: "Anonymous" });
      expect(failureTuple[1]).toBeUndefined();
    });
  });

  describe("Async Support", () => {
    describe("ezTry with async handlers", () => {
      it("should handle single async catcher that resolves", async () => {
        const asyncCatcher = ezCatchTypeAsync("NETWORK_ERROR", async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ezOk("async recovery");
        });
        const tryFn = ezTry(asyncCatcher);

        const result = await tryFn(networkError);

        expect(result.isSuccess).toBe(true);
        if (result.isSuccess) {
          expect(result.value).toBe("async recovery");
        }
      });

      it("should handle single async catcher that rejects", async () => {
        const asyncCatcher = ezCatchTypeAsync("NETWORK_ERROR", async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ezFail("RECOVERY_ERROR", "Failed to recover");
        });
        const tryFn = ezTry(asyncCatcher);

        const result = await tryFn(networkError);

        expect(result.isSuccess).toBe(false);
        if (!result.isSuccess) {
          expect(result.failure.type).toBe("RECOVERY_ERROR");
          expect(result.failure.message).toBe("Failed to recover");
        }
      });

      it("should return sync result when success with async catcher", async () => {
        const asyncCatcher = ezCatchTypeAsync("NETWORK_ERROR", async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ezOk("async recovery");
        });
        const tryFn = ezTry(asyncCatcher);

        const result = await tryFn(successResult);

        expect(result).toBe(successResult);
        expect(result.isSuccess).toBe(true);
        if (result.isSuccess) {
          expect(result.value).toBe("success value");
        }
      });

      it("should work with mixed sync and async catchers", async () => {
        const syncCatcher = ezCatchType("VALIDATION_ERROR", () => ezOk("sync recovery"));
        const asyncCatcher = ezCatchTypeAsync("NETWORK_ERROR", async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ezOk("async recovery");
        });
        const tryFn = ezTry(syncCatcher, asyncCatcher);

        const networkResult = await tryFn(networkError);
        const validationResult = await tryFn(validationError);

        expect(networkResult.isSuccess).toBe(true);
        if (networkResult.isSuccess) {
          expect(networkResult.value).toBe("async recovery");
        }

        expect(validationResult.isSuccess).toBe(true);
        if (validationResult.isSuccess) {
          expect(validationResult.value).toBe("sync recovery");
        }
      });

      it("should handle async default catcher", async () => {
        const asyncDefaultCatcher = ezCatchDefaultAsync(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ezOk("async default recovery");
        });
        const tryFn = ezTry(asyncDefaultCatcher);

        const result = await tryFn(unknownError);

        expect(result.isSuccess).toBe(true);
        if (result.isSuccess) {
          expect(result.value).toBe("async default recovery");
        }
      });

      it("should prioritize first matching async catcher", async () => {
        const firstAsyncCatcher = ezCatchTypeAsync("NETWORK_ERROR", async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ezOk("first async handler");
        });
        const secondAsyncCatcher = ezCatchTypeAsync("NETWORK_ERROR", async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ezOk("second async handler");
        });
        const tryFn = ezTry(firstAsyncCatcher, secondAsyncCatcher);

        const result = await tryFn(networkError);

        expect(result.isSuccess).toBe(true);
        if (result.isSuccess) {
          expect(result.value).toBe("first async handler");
        }
      });
    });

    describe("ezCatchType with async handlers", () => {
      it("should create async catcher with proper types", () => {
        const asyncCatcher = ezCatchTypeAsync<NetworkErrorRez>("NETWORK_ERROR", async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ezOk("async recovery");
        });

        expect(asyncCatcher.filter).toBeInstanceOf(Function);
        expect(asyncCatcher.handler).toBeInstanceOf(Function);
        expect(asyncCatcher.filter(networkError.failure)).toBe(true);
        // @ts-expect-error - This is testing a runtime check that should be prevented by the type system
        expect(asyncCatcher.filter(validationError.failure)).toBe(false);
      });
    });

    describe("ezCatchDefault with async handlers", () => {
      it("should create async default catcher with proper types", () => {
        const asyncDefaultCatcher = ezCatchDefaultAsync<NetworkErrorRez>(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ezOk("async default recovery");
        });

        expect(asyncDefaultCatcher.filter).toBeInstanceOf(Function);
        expect(asyncDefaultCatcher.handler).toBeInstanceOf(Function);
        expect(asyncDefaultCatcher.filter(networkError.failure)).toBe(true);
        // @ts-expect-error - This is testing a runtime check that should be prevented by the type system
        expect(asyncDefaultCatcher.filter(validationError.failure)).toBe(true);
      });
    });

    describe("ezOrThen with async handlers", () => {
      it("should handle async handler for failed result", async () => {
        const result = await ezOrThen(networkError, async (failure) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          expect(failure.type).toBe("NETWORK_ERROR");
          return ezOk("async recovery");
        });

        expect(result.isSuccess).toBe(true);
        if (result.isSuccess) {
          expect(result.value).toBe("async recovery");
        }
      });

      it("should return sync result for successful result with async handler", async () => {
        const result = await ezOrThen(successResult, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return ezOk("should not be called");
        });

        expect(result).toBe(successResult);
        expect(result.isSuccess).toBe(true);
        if (result.isSuccess) {
          expect(result.value).toBe("success value");
        }
      });

      it("should handle async handler that returns failure", async () => {
        const result = await ezOrThen(networkError, async (failure) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          expect(failure.type).toBe("NETWORK_ERROR");
          return ezFail("RECOVERY_ERROR", "Failed to recover async");
        });

        expect(result.isSuccess).toBe(false);
        if (!result.isSuccess) {
          expect(result.failure.type).toBe("RECOVERY_ERROR");
          expect(result.failure.message).toBe("Failed to recover async");
        }
      });
    });

    describe("Type inference tests", () => {
      it("should infer correct return types for sync handlers", () => {
        const syncCatcher = ezCatchType("NETWORK_ERROR", () => ezOk("sync"));
        const tryFn = ezTry(syncCatcher);

        // TypeScript should infer this as non-Promise
        const result = tryFn(networkError);
        expect(result).not.toBeInstanceOf(Promise);
      });

      it("should infer correct return types for async handlers", async () => {
        const asyncCatcher = ezCatchTypeAsync<NetworkErrorRez>("NETWORK_ERROR", () =>
          Promise.resolve(ezOk("async")),
        );
        const tryFn = ezTry<NetworkErrorRez>(asyncCatcher);

        // TypeScript should infer this as Promise
        const result = tryFn(networkError);
        expect(result).toBeInstanceOf(Promise);

        const resolved = await result;
        expect(resolved.isSuccess).toBe(true);
      });

      it("should infer Promise when mixed with at least one async handler", async () => {
        const syncCatcher = ezCatchType("VALIDATION_ERROR", () => ezOk("sync"));
        const asyncCatcher = ezCatchTypeAsync("NETWORK_ERROR", async () => ezOk("async"));
        const tryFn = ezTry(syncCatcher, asyncCatcher);

        // TypeScript should infer this as Promise because of the async catcher
        const result = tryFn(networkError);
        expect(result).toBeInstanceOf(Promise);

        const resolved = await result;
        expect(resolved.isSuccess).toBe(true);
      });

      it("should return Promise for mixed async success input", async () => {
        const syncCatcher = ezCatchType("VALIDATION_ERROR", () => ezOk("sync"));
        const asyncCatcher = ezCatchTypeAsync("NETWORK_ERROR", async () => ezOk("async"));
        const tryFn = ezTry(syncCatcher, asyncCatcher);

        const result = tryFn(successResult);

        expect(result).toBeInstanceOf(Promise);
        expect(await result).toBe(successResult);
      });

      it("should return Promise for mixed async uncaught failure input", async () => {
        const syncCatcher = ezCatchType("VALIDATION_ERROR", () => ezOk("sync"));
        const asyncCatcher = ezCatchTypeAsync("NETWORK_ERROR", async () => ezOk("async"));
        const tryFn = ezTry(syncCatcher, asyncCatcher);

        const result = tryFn(authError);

        expect(result).toBeInstanceOf(Promise);
        expect(await result).toBe(authError);
      });

      it("should return Promise for mixed async sync-caught failure input", async () => {
        const syncCatcher = ezCatchType("VALIDATION_ERROR", () => ezOk("sync"));
        const asyncCatcher = ezCatchTypeAsync("NETWORK_ERROR", async () => ezOk("async"));
        const tryFn = ezTry(syncCatcher, asyncCatcher);

        const result = tryFn(validationError);

        expect(result).toBeInstanceOf(Promise);
        expect(await result).toEqual(ezOk("sync"));
      });

      it("should return Promise for mixed async async-caught failure input", async () => {
        const syncCatcher = ezCatchType("VALIDATION_ERROR", () => ezOk("sync"));
        const asyncCatcher = ezCatchTypeAsync("NETWORK_ERROR", async () => ezOk("async"));
        const tryFn = ezTry(syncCatcher, asyncCatcher);

        const result = tryFn(networkError);

        expect(result).toBeInstanceOf(Promise);
        expect(await result).toEqual(ezOk("async"));
      });
    });

    describe("Integration tests with async handlers", () => {
      it("should work in complex async pipeline", async () => {
        // Simulate API call that might fail
        const fetchUser = async (shouldFail: boolean) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (shouldFail) {
            return ezFail("API_ERROR", "Failed to fetch user");
          }
          return ezOk({ id: 1, name: "John" });
        };
        // Test success path
        const successResult = await fetchUser(false);
        const tryFn = ezTry<typeof successResult>(
          ezCatchTypeAsync("API_ERROR", async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return ezOk({ id: 0, name: "Anonymous" });
          }),
        );

        const processedSuccess = await tryFn(successResult);
        expect(processedSuccess.isSuccess).toBe(true);
        if (processedSuccess.isSuccess) {
          expect(processedSuccess.value.name).toBe("John");
        }

        // Test failure recovery path
        const failureResult = await fetchUser(true);
        const processedFailure = await tryFn(failureResult);
        expect(processedFailure.isSuccess).toBe(true);
        if (processedFailure.isSuccess) {
          expect(processedFailure.value.name).toBe("Anonymous");
        }
      });
    });
  });

  describe("toEzRezAsync", () => {
    it("should wrap successful async callback and return EzRezOk", async () => {
      const callback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "successful result";
      };

      const result = await toEzRezAsync(callback);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe("successful result");
      }
    });

    it("should catch exceptions from async callback and return default RuntimeError", async () => {
      const callback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error("Something went wrong");
      };

      const result = await toEzRezAsync(callback);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.failure.type).toBe("RuntimeError");
        expect(result.failure.message).toBe("Something went wrong");
        expect(result.failure.data.error).toBeInstanceOf(Error);
      }
    });

    it("should catch non-Error exceptions from async callback and return RuntimeError", async () => {
      const callback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        //eslint-disable-next-line @typescript-eslint/only-throw-error
        throw { msg: "This is not an actual Error" };
      };

      const result = await toEzRezAsync(callback);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.failure.type).toBe("RuntimeError");
        expect(result.failure.message).toBe("Unknown error");
        expect(result.failure.data.error).not.toBeInstanceOf(Error);
      }
    });

    it("should catch non-Error exceptions and return RuntimeError and extract message attribute", async () => {
      const callback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        //eslint-disable-next-line @typescript-eslint/only-throw-error
        throw { message: "Custom object message" };
      };

      const result = await toEzRezAsync(callback);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.failure.type).toBe("RuntimeError");
        expect(result.failure.message).toBe("Custom object message");
        expect(result.failure.data.error).not.toBeInstanceOf(Error);
      }
    });

    it("should use custom catcher when provided", async () => {
      const callback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error("Custom error");
      };

      const customCatcher = (error: unknown) =>
        ezFail("CUSTOM_ERROR", "This is a custom error", { originalError: error });

      const result = await toEzRezAsync(callback, customCatcher);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.failure.type).toBe("CUSTOM_ERROR");
        expect(result.failure.message).toBe("This is a custom error");
        expect(result.failure.data.originalError).toBeInstanceOf(Error);
      }
    });

    it("should work with different return value types", async () => {
      const numberCallback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 42;
      };
      const objectCallback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { key: "value", items: [1, 2, 3] };
      };
      const booleanCallback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return true;
      };
      const nullCallback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return null;
      };

      const numberResult = await toEzRezAsync(numberCallback);
      const objectResult = await toEzRezAsync(objectCallback);
      const booleanResult = await toEzRezAsync(booleanCallback);
      const nullResult = await toEzRezAsync(nullCallback);

      expect(numberResult.isSuccess).toBe(true);
      if (numberResult.isSuccess) expect(numberResult.value).toBe(42);

      expect(objectResult.isSuccess).toBe(true);
      if (objectResult.isSuccess) {
        expect(objectResult.value).toEqual({ key: "value", items: [1, 2, 3] });
      }

      expect(booleanResult.isSuccess).toBe(true);
      if (booleanResult.isSuccess) expect(booleanResult.value).toBe(true);

      expect(nullResult.isSuccess).toBe(true);
      if (nullResult.isSuccess) expect(nullResult.value).toBe(null);
    });

    it("should handle complex custom catcher scenarios", async () => {
      const callback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const error = new Error("Network timeout");
        (error as any).code = "TIMEOUT";
        throw error;
      };

      const networkCatcher = (error: unknown) => {
        if (error instanceof Error && (error as Error & { code: string }).code === "TIMEOUT") {
          return ezFail("NETWORK_TIMEOUT", "Request timed out", {
            code: (error as Error & { code: string }).code,
            originalMessage: error.message,
          });
        }
        return ezFail("NETWORK_TIMEOUT", "Unknown network error", {
          code: "UNKNOWN",
          originalMessage: "Unknown error",
        });
      };

      const result = await toEzRezAsync(callback, networkCatcher);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.failure.type).toBe("NETWORK_TIMEOUT");
        expect(result.failure.message).toBe("Request timed out");
        expect((result.failure.data as any).code).toBe("TIMEOUT");
        expect((result.failure.data as any).originalMessage).toBe("Network timeout");
      }
    });

    it("should handle catcher that transforms different error types", async () => {
      const typeErrorCallback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new TypeError("Type error occurred");
      };

      const rangeErrorCallback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new RangeError("Range error occurred");
      };

      const errorTypeCatcher = (error: unknown) => {
        if (error instanceof TypeError) {
          return ezFail("TYPE_ERROR", "Invalid type", { errorType: "TypeError" });
        }
        if (error instanceof RangeError) {
          return ezFail("RANGE_ERROR", "Out of range", { errorType: "RangeError" });
        }
        return ezFail("GENERIC_ERROR", "Generic error", { errorType: "Unknown" });
      };

      // @ts-expect-error - Type inference issue with error catcher returning union types
      const typeResult = await toEzRezAsync(typeErrorCallback, errorTypeCatcher);
      // @ts-expect-error - Type inference issue with error catcher returning union types
      const rangeResult = await toEzRezAsync(rangeErrorCallback, errorTypeCatcher);

      expect(typeResult.isSuccess).toBe(false);
      if (!typeResult.isSuccess) {
        expect(typeResult.failure.type).toBe("TYPE_ERROR");
        expect(typeResult.failure.data.errorType).toBe("TypeError");
      }

      expect(rangeResult.isSuccess).toBe(false);
      if (!rangeResult.isSuccess) {
        expect(rangeResult.failure.type).toBe("RANGE_ERROR");
        expect(rangeResult.failure.data.errorType).toBe("RangeError");
      }
    });

    it("should handle immediate rejections", async () => {
      const callback = async () => {
        throw new Error("Immediate error");
      };

      const result = await toEzRezAsync(callback);

      expect(result.isSuccess).toBe(false);
      if (!result.isSuccess) {
        expect(result.failure.type).toBe("RuntimeError");
        expect(result.failure.message).toBe("Immediate error");
      }
    });

    it("should handle callbacks with side effects", async () => {
      let sideEffectValue = "initial";

      const sideEffectCallback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        sideEffectValue = "modified";
        return "callback result";
      };

      const result = await toEzRezAsync(sideEffectCallback);

      expect(sideEffectValue).toBe("modified");
      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value).toBe("callback result");
      }
    });

    it("should preserve promise rejection order", async () => {
      const callback = async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        throw new Error("Delayed error");
      };

      const startTime = Date.now();
      const result = await toEzRezAsync(callback);
      const endTime = Date.now();

      expect(result.isSuccess).toBe(false);
      expect(endTime - startTime).toBeGreaterThanOrEqual(40); // Should wait for the promise
    });
  });
});
