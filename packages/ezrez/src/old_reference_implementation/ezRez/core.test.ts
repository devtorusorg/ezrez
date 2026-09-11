import { describe, expect, it } from "vitest";
import { ezFail, ezOk, isEzRez } from "./core";

describe("core.ts", () => {
  describe("ezOk", () => {
    it("should create a successful result with a string value", () => {
      const result = ezOk("test value");

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe("test value");
      expect(result.failure).toBeUndefined();
    });

    it("should create a successful result with a number value", () => {
      const result = ezOk(42);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(42);
      expect(result.failure).toBeUndefined();
    });

    it("should create a successful result with an object value", () => {
      const testObject = { name: "test", id: 123 };
      const result = ezOk(testObject);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(testObject);
      expect(result.value).toEqual({ name: "test", id: 123 });
      expect(result.failure).toBeUndefined();
    });

    it("should create a successful result with an array value", () => {
      const testArray = [1, 2, 3];
      const result = ezOk(testArray);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(testArray);
      expect(result.value).toEqual([1, 2, 3]);
      expect(result.failure).toBeUndefined();
    });

    it("should create a successful result with null value", () => {
      const result = ezOk(null);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(null);
      expect(result.failure).toBeUndefined();
    });

    it("should create a successful result with undefined value", () => {
      const result = ezOk(undefined);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(undefined);
      expect(result.failure).toBeUndefined();
    });

    it("should create a successful result with boolean value", () => {
      const resultTrue = ezOk(true);
      const resultFalse = ezOk(false);

      expect(resultTrue.isSuccess).toBe(true);
      expect(resultTrue.value).toBe(true);
      expect(resultFalse.isSuccess).toBe(true);
      expect(resultFalse.value).toBe(false);
    });

    it("should create a successful result with empty object", () => {
      const result = ezOk({});

      expect(result.isSuccess).toBe(true);
      expect(result.value).toEqual({});
      expect(result.failure).toBeUndefined();
    });

    it("should create a successful result with empty array", () => {
      const result = ezOk([]);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toEqual([]);
      expect(result.failure).toBeUndefined();
    });
  });

  describe("ezFail", () => {
    describe("without data parameter", () => {
      it("should create a failure result with type and message", () => {
        const result = ezFail("NETWORK_ERROR", "Connection failed");

        expect(result.isSuccess).toBe(false);
        expect(result.value).toBeUndefined();
        expect(result.failure).toEqual({
          type: "NETWORK_ERROR",
          message: "Connection failed",
        });
        //@ts-expect-error - This is testing a runtime check that should be prevented by the type system
        expect(result.failure.data).toBeUndefined();
      });

      it("should create a failure result with different error types", () => {
        const validationError = ezFail("VALIDATION_ERROR", "Invalid input");
        const authError = ezFail("AUTH_ERROR", "Unauthorized");
        const dbError = ezFail("DATABASE_ERROR", "Query failed");

        expect(validationError.failure.type).toBe("VALIDATION_ERROR");
        expect(validationError.failure.message).toBe("Invalid input");

        expect(authError.failure.type).toBe("AUTH_ERROR");
        expect(authError.failure.message).toBe("Unauthorized");

        expect(dbError.failure.type).toBe("DATABASE_ERROR");
        expect(dbError.failure.message).toBe("Query failed");
      });

      it("should create a failure result with empty message", () => {
        const result = ezFail("ERROR_TYPE", "");

        expect(result.isSuccess).toBe(false);
        expect(result.failure.type).toBe("ERROR_TYPE");
        expect(result.failure.message).toBe("");
      });
    });

    describe("with data parameter", () => {
      it("should create a failure result with data object", () => {
        const errorData = { field: "email", code: 400 };
        const result = ezFail("VALIDATION_ERROR", "Invalid email", errorData);

        expect(result.isSuccess).toBe(false);
        expect(result.value).toBeUndefined();
        expect(result.failure).toEqual({
          type: "VALIDATION_ERROR",
          message: "Invalid email",
          data: errorData,
        });
        expect(result.failure.data).toBe(errorData);
      });

      it("should create a failure result with complex data object", () => {
        const errorData = {
          errors: [
            { field: "email", message: "Required" },
            { field: "password", message: "Too short" },
          ],
          statusCode: 422,
          timestamp: new Date("2023-01-01"),
        };
        const result = ezFail("VALIDATION_ERROR", "Multiple validation errors", errorData);

        expect(result.isSuccess).toBe(false);
        if (!result.isSuccess) {
          expect(result.failure.data).toBe(errorData);
          expect(result.failure.data.errors).toHaveLength(2);
          expect(result.failure.data.statusCode).toBe(422);
        }
      });

      it("should create a failure result with empty data object", () => {
        const result = ezFail("ERROR_TYPE", "Error message", {});

        expect(result.isSuccess).toBe(false);
        expect(result.failure.data).toEqual({});
      });

      it("should create a failure result with nested data object", () => {
        const errorData = {
          user: { id: 123, name: "John" },
          context: { route: "/api/users", method: "POST" },
        };
        const result = ezFail("USER_ERROR", "User operation failed", errorData);

        expect(result.isSuccess).toBe(false);
        expect(result.failure.data.user.id).toBe(123);
        expect(result.failure.data.context.route).toBe("/api/users");
      });

      it("should create a failure result with special characters in type and message", () => {
        const result = ezFail("ERROR_TYPE_WITH_SYMBOLS!@#$%", "Message with émojis 🚨 and ünicøde");

        expect(result.isSuccess).toBe(false);
        expect(result.failure.type).toBe("ERROR_TYPE_WITH_SYMBOLS!@#$%");
        expect(result.failure.message).toBe("Message with émojis 🚨 and ünicøde");
      });

      it("should create a failure result with very long strings", () => {
        const longType = "A".repeat(1000);
        const longMessage = "B".repeat(2000);
        const result = ezFail(longType, longMessage);

        expect(result.isSuccess).toBe(false);
        expect(result.failure.type).toBe(longType);
        expect(result.failure.message).toBe(longMessage);
        expect(result.failure.type.length).toBe(1000);
        expect(result.failure.message.length).toBe(2000);
      });

      it("should create a failure result with data containing all primitive types", () => {
        const errorData = {
          string: "test",
          number: 42,
          boolean: true,
          nullValue: null,
          undefinedValue: undefined,
          symbol: Symbol("test"),
          bigint: BigInt(123),
        };
        const result = ezFail("MIXED_TYPES_ERROR", "Mixed types error", errorData);

        expect(result.isSuccess).toBe(false);
        expect(result.failure.data.string).toBe("test");
        expect(result.failure.data.number).toBe(42);
        expect(result.failure.data.boolean).toBe(true);
        expect(result.failure.data.nullValue).toBe(null);
        expect(result.failure.data.undefinedValue).toBe(undefined);
        expect(typeof result.failure.data.symbol).toBe("symbol");
        expect(typeof result.failure.data.bigint).toBe("bigint");
      });

      it("should create a failure result with circular reference in data (should not crash)", () => {
        type CircularData = { name: string; self?: CircularData };
        const errorData: CircularData = { name: "circular" };
        errorData.self = errorData;
        const result = ezFail("CIRCULAR_ERROR", "Circular reference error", errorData);

        expect(result.isSuccess).toBe(false);
        expect(result.failure.data.name).toBe("circular");
        expect(result.failure.data.self).toBe(errorData);
      });

      it("should create a failure result with function in data object", () => {
        const errorData = {
          callback: () => "test",
          arrowFunction: (x: number) => x * 2,
          namedFunction: function namedFn() {
            return "named";
          },
        };
        const result = ezFail("FUNCTION_ERROR", "Function error", errorData);

        expect(result.isSuccess).toBe(false);
        expect(typeof result.failure.data.callback).toBe("function");
        expect(typeof result.failure.data.arrowFunction).toBe("function");
        expect(typeof result.failure.data.namedFunction).toBe("function");
        expect(result.failure.data.callback()).toBe("test");
        expect(result.failure.data.arrowFunction(5)).toBe(10);
      });

      it("should create a failure result with array containing mixed types in data", () => {
        const errorData = {
          mixedArray: [
            "string",
            42,
            true,
            null,
            undefined,
            { nested: "object" },
            [1, 2, 3],
            () => "function",
          ],
        };
        const result = ezFail("ARRAY_ERROR", "Array error", errorData);

        expect(result.isSuccess).toBe(false);
        expect(Array.isArray(result.failure.data.mixedArray)).toBe(true);
        expect(result.failure.data.mixedArray).toHaveLength(8);
        expect(result.failure.data.mixedArray[0]).toBe("string");
        expect(result.failure.data.mixedArray[5]).toEqual({ nested: "object" });
      });
    });

    describe("ezFail overload behavior", () => {
      it("should properly type the result when called without data parameter", () => {
        const result = ezFail("NO_DATA_ERROR", "Error without data");

        expect(result.isSuccess).toBe(false);
        expect(result.failure.type).toBe("NO_DATA_ERROR");
        expect(result.failure.message).toBe("Error without data");
        expect("data" in result.failure).toBe(false);
      });

      it("should properly type the result when called with data parameter", () => {
        const result = ezFail("WITH_DATA_ERROR", "Error with data", { code: 400 });

        expect(result.isSuccess).toBe(false);
        expect(result.failure.type).toBe("WITH_DATA_ERROR");
        expect(result.failure.message).toBe("Error with data");
        expect("data" in result.failure).toBe(true);
        expect(result.failure.data.code).toBe(400);
      });

      it("should handle explicitly passed undefined data parameter", () => {
        const result = ezFail("UNDEFINED_DATA_ERROR", "Error with undefined data", undefined);

        expect(result.isSuccess).toBe(false);
        expect(result.failure.type).toBe("UNDEFINED_DATA_ERROR");
        expect(result.failure.message).toBe("Error with undefined data");
        // The implementation should handle undefined as no data
      });
    });
  });

  describe("isEzRez", () => {
    describe("valid EzRez objects", () => {
      it("should return true for valid success result", () => {
        const successResult = ezOk("test value");
        expect(isEzRez(successResult)).toBe(true);
      });

      it("should return true for valid failure result without data", () => {
        const failureResult = ezFail("ERROR_TYPE", "Error message");
        expect(isEzRez(failureResult)).toBe(true);
      });

      it("should return true for valid failure result with data", () => {
        const failureResult = ezFail("ERROR_TYPE", "Error message", { field: "test" });
        expect(isEzRez(failureResult)).toBe(true);
      });

      it("should return true for success result with null value", () => {
        const result = ezOk(null);
        expect(isEzRez(result)).toBe(true);
      });

      it("should return true for success result with undefined value", () => {
        const result = ezOk(undefined);
        expect(isEzRez(result)).toBe(true);
      });

      it("should return true for success result with complex object", () => {
        const result = ezOk({ users: [{ id: 1, name: "John" }], count: 1 });
        expect(isEzRez(result)).toBe(true);
      });

      it("should return true for success result with Date object", () => {
        const result = ezOk(new Date("2023-01-01"));
        expect(isEzRez(result)).toBe(true);
      });

      it("should return true for success result with RegExp object", () => {
        const result = ezOk(/test/g);
        expect(isEzRez(result)).toBe(true);
      });

      it("should return true for success result with Error object", () => {
        const result = ezOk(new Error("test error"));
        expect(isEzRez(result)).toBe(true);
      });

      it("should return true for success result with Map object", () => {
        const map = new Map([["key", "value"]]);
        const result = ezOk(map);
        expect(isEzRez(result)).toBe(true);
      });

      it("should return true for success result with Set object", () => {
        const set = new Set([1, 2, 3]);
        const result = ezOk(set);
        expect(isEzRez(result)).toBe(true);
      });

      it("should return true for success result with nested arrays", () => {
        const result = ezOk([
          [1, 2],
          [3, 4],
          [5, 6],
        ]);
        expect(isEzRez(result)).toBe(true);
      });

      it("should return true for success result with deeply nested object", () => {
        const deepObject = {
          level1: {
            level2: {
              level3: {
                level4: {
                  value: "deep",
                  array: [{ nested: true }],
                },
              },
            },
          },
        };
        const result = ezOk(deepObject);
        expect(isEzRez(result)).toBe(true);
      });

      it("should return true for success result with symbol value", () => {
        const sym = Symbol("test");
        const result = ezOk(sym);
        expect(isEzRez(result)).toBe(true);
      });

      it("should return true for success result with BigInt value", () => {
        const result = ezOk(BigInt(123456789012345678901234567890n));
        expect(isEzRez(result)).toBe(true);
      });

      it("should return true for failure result with complex data object containing various types", () => {
        const complexData = {
          timestamp: new Date(),
          regex: /pattern/i,
          map: new Map([["key", "value"]]),
          set: new Set([1, 2, 3]),
          nested: {
            array: [{ id: 1 }, { id: 2 }],
            nullValue: null,
            undefinedValue: undefined,
          },
          bigint: BigInt(123n),
          symbol: Symbol("test"),
        };
        const result = ezFail("COMPLEX_ERROR", "Complex error", complexData);
        expect(isEzRez(result)).toBe(true);
      });
    });

    describe("invalid EzRez objects", () => {
      it("should return false for null", () => {
        expect(isEzRez(null)).toBe(false);
      });

      it("should return false for undefined", () => {
        expect(isEzRez(undefined)).toBe(false);
      });

      it("should return false for primitives", () => {
        expect(isEzRez("string")).toBe(false);
        expect(isEzRez(123)).toBe(false);
        expect(isEzRez(true)).toBe(false);
        expect(isEzRez(false)).toBe(false);
      });

      it("should return false for empty object", () => {
        expect(isEzRez({})).toBe(false);
      });

      it("should return false for object without isSuccess", () => {
        expect(isEzRez({ value: "test" })).toBe(false);
        expect(isEzRez({ failure: { type: "ERROR", message: "test" } })).toBe(false);
      });

      it("should return false for object with invalid isSuccess value", () => {
        expect(isEzRez({ isSuccess: "true" })).toBe(false);
        expect(isEzRez({ isSuccess: 1 })).toBe(false);
        expect(isEzRez({ isSuccess: null })).toBe(false);
      });

      it("should return false for success object without value", () => {
        expect(isEzRez({ isSuccess: true })).toBe(false);
      });

      it("should return false for failure object without failure property", () => {
        expect(isEzRez({ isSuccess: false })).toBe(false);
      });

      it("should return false for failure object with invalid failure structure", () => {
        expect(isEzRez({ isSuccess: false, failure: null })).toBe(false);
        expect(isEzRez({ isSuccess: false, failure: "error" })).toBe(false);
        expect(isEzRez({ isSuccess: false, failure: {} })).toBe(false);
        expect(isEzRez({ isSuccess: false, failure: { type: "ERROR" } })).toBe(false);
        expect(isEzRez({ isSuccess: false, failure: { message: "Error" } })).toBe(false);
      });

      it("should return false for failure object with invalid type", () => {
        expect(
          isEzRez({
            isSuccess: false,
            failure: { type: 123, message: "Error message" },
          }),
        ).toBe(false);

        expect(
          isEzRez({
            isSuccess: false,
            failure: { type: null, message: "Error message" },
          }),
        ).toBe(false);
      });

      it("should return false for failure object with invalid message", () => {
        expect(
          isEzRez({
            isSuccess: false,
            failure: { type: "ERROR", message: 123 },
          }),
        ).toBe(false);

        expect(
          isEzRez({
            isSuccess: false,
            failure: { type: "ERROR", message: null },
          }),
        ).toBe(false);
      });

      it("should return false for failure object with invalid data", () => {
        expect(
          isEzRez({
            isSuccess: false,
            failure: { type: "ERROR", message: "Error message", data: null },
          }),
        ).toBe(false);

        expect(
          isEzRez({
            isSuccess: false,
            failure: { type: "ERROR", message: "Error message", data: "invalid" },
          }),
        ).toBe(false);
      });

      it("should return false for arrays", () => {
        expect(isEzRez([])).toBe(false);
        expect(isEzRez([1, 2, 3])).toBe(false);
      });

      it("should return false for functions", () => {
        expect(isEzRez(() => {})).toBe(false);
        expect(isEzRez(() => {})).toBe(false);
      });

      it("should return false for class instances without proper structure", () => {
        class TestClass {
          constructor(public value: string) {}
        }
        expect(isEzRez(new TestClass("test"))).toBe(false);
      });

      it("should return false for objects with isSuccess but missing value property", () => {
        expect(isEzRez({ isSuccess: true, notValue: "test" })).toBe(false);
      });

      it("should return false for objects with truthy non-boolean isSuccess", () => {
        expect(isEzRez({ isSuccess: "true", value: "test" })).toBe(false);
        expect(isEzRez({ isSuccess: 1, value: "test" })).toBe(false);
        expect(isEzRez({ isSuccess: {}, value: "test" })).toBe(false);
      });

      it("should return false for objects with falsy non-boolean isSuccess", () => {
        expect(isEzRez({ isSuccess: "", value: "test" })).toBe(false);
        expect(isEzRez({ isSuccess: 0, value: "test" })).toBe(false);
        expect(isEzRez({ isSuccess: null, value: "test" })).toBe(false);
      });

      it("should return false for success objects with extra failure property", () => {
        expect(
          isEzRez({
            isSuccess: true,
            value: "test",
            failure: { type: "ERROR", message: "Should not be here" },
          }),
        ).toBe(false);
      });

      it("should return false for failure objects with missing failure properties", () => {
        expect(isEzRez({ isSuccess: false, failure: {} })).toBe(false);
        expect(isEzRez({ isSuccess: false, failure: { type: "ERROR" } })).toBe(false);
        expect(isEzRez({ isSuccess: false, failure: { message: "Error" } })).toBe(false);
      });

      it("should return true for failure objects with empty string type", () => {
        expect(
          isEzRez({
            isSuccess: false,
            failure: { type: "", message: "Error message" },
          }),
        ).toBe(true); // Empty string is still a valid string
      });

      it("should return true for failure objects with empty string message", () => {
        expect(
          isEzRez({
            isSuccess: false,
            failure: { type: "ERROR", message: "" },
          }),
        ).toBe(true); // Empty string is still a valid string
      });

      it("should return false for failure objects with array as type", () => {
        expect(
          isEzRez({
            isSuccess: false,
            failure: { type: ["ERROR"], message: "Error message" },
          }),
        ).toBe(false);
      });

      it("should return false for failure objects with array as message", () => {
        expect(
          isEzRez({
            isSuccess: false,
            failure: { type: "ERROR", message: ["Error message"] },
          }),
        ).toBe(false);
      });

      it("should return false for failure objects with undefined type", () => {
        expect(
          isEzRez({
            isSuccess: false,
            failure: { type: undefined, message: "Error message" },
          }),
        ).toBe(false);
      });

      it("should return false for failure objects with undefined message", () => {
        expect(
          isEzRez({
            isSuccess: false,
            failure: { type: "ERROR", message: undefined },
          }),
        ).toBe(false);
      });

      it("should return false for Date objects", () => {
        expect(isEzRez(new Date())).toBe(false);
      });

      it("should return false for RegExp objects", () => {
        expect(isEzRez(/test/)).toBe(false);
      });

      it("should return false for Error objects", () => {
        expect(isEzRez(new Error("test"))).toBe(false);
      });

      it("should return false for Map objects", () => {
        expect(isEzRez(new Map())).toBe(false);
      });

      it("should return false for Set objects", () => {
        expect(isEzRez(new Set())).toBe(false);
      });

      it("should return false for Symbol", () => {
        expect(isEzRez(Symbol("test"))).toBe(false);
      });

      it("should return false for BigInt", () => {
        expect(isEzRez(BigInt(123))).toBe(false);
      });

      it("should return false for WeakMap", () => {
        expect(isEzRez(new WeakMap())).toBe(false);
      });

      it("should return false for WeakSet", () => {
        expect(isEzRez(new WeakSet())).toBe(false);
      });

      it("should return false for Promise", () => {
        expect(isEzRez(Promise.resolve("test"))).toBe(false);
      });
    });

    describe("edge cases", () => {
      it("should return true for manually constructed valid success object", () => {
        const manualSuccess = {
          isSuccess: true as const,
          value: "manual value",
        };
        expect(isEzRez(manualSuccess)).toBe(true);
      });

      it("should return true for manually constructed valid failure object", () => {
        const manualFailure = {
          isSuccess: false as const,
          failure: {
            type: "MANUAL_ERROR",
            message: "Manual error message",
          },
        };
        expect(isEzRez(manualFailure)).toBe(true);
      });

      it("should return true for manually constructed valid failure object with data", () => {
        const manualFailure = {
          isSuccess: false as const,
          failure: {
            type: "MANUAL_ERROR",
            message: "Manual error message",
            data: { field: "test" },
          },
        };
        expect(isEzRez(manualFailure)).toBe(true);
      });

      it("should handle objects with extra properties", () => {
        const extraPropsSuccess = {
          isSuccess: true as const,
          value: "test",
          extraProp: "should not matter",
        };
        expect(isEzRez(extraPropsSuccess)).toBe(true);

        const extraPropsFailure = {
          isSuccess: false as const,
          failure: {
            type: "ERROR",
            message: "Error message",
          },
          extraProp: "should not matter",
        };
        expect(isEzRez(extraPropsFailure)).toBe(true);
      });
    });
  });

  describe("type safety and integration", () => {
    it("should maintain type safety with ezOk results", () => {
      const stringResult = ezOk("test");
      const numberResult = ezOk(42);
      const objectResult = ezOk({ name: "test" });

      // Type guards should work correctly
      if (stringResult.isSuccess) {
        expect(typeof stringResult.value).toBe("string");
      }
      if (numberResult.isSuccess) {
        expect(typeof numberResult.value).toBe("number");
      }
      if (objectResult.isSuccess) {
        expect(typeof objectResult.value).toBe("object");
      }
    });

    it("should maintain type safety with ezFail results", () => {
      const errorWithoutData = ezFail("ERROR_TYPE", "Error message");
      const errorWithData = ezFail("VALIDATION_ERROR", "Validation failed", { field: "email" });

      // Type guards should work correctly
      if (!errorWithoutData.isSuccess) {
        expect(errorWithoutData.failure.type).toBe("ERROR_TYPE");
        expect(errorWithoutData.failure.message).toBe("Error message");
      }
      if (!errorWithData.isSuccess) {
        expect(errorWithData.failure.type).toBe("VALIDATION_ERROR");
        expect(errorWithData.failure.data.field).toBe("email");
      }
    });

    it("should work with isEzRez type guard in conditional logic", () => {
      const unknownValue: unknown = ezOk("test value");

      if (isEzRez(unknownValue)) {
        // TypeScript should know this is an EzRez now
        expect(typeof unknownValue.isSuccess).toBe("boolean");
        if (unknownValue.isSuccess) {
          expect(unknownValue.value).toBe("test value");
        }
      }
    });

    it("should handle mixed arrays of EzRez objects", () => {
      const results = [
        ezOk("success1"),
        ezFail("ERROR1", "Error 1"),
        ezOk(42),
        ezFail("ERROR2", "Error 2", { code: 500 }),
      ];

      const validResults = results.filter(isEzRez);
      expect(validResults).toHaveLength(4);

      const successResults = validResults.filter((r) => r.isSuccess);
      const failureResults = validResults.filter((r) => !r.isSuccess);

      expect(successResults).toHaveLength(2);
      expect(failureResults).toHaveLength(2);
    });
  });
});
