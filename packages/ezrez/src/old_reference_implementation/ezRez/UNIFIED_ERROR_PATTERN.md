# EzRez Unified Error Pattern

## Summary

The `EzRez` type now uses a unified error pattern where error types and their data are defined together as a single object union, making error handling more type-safe and readable.

## What Changed

### Old Pattern (Removed)

```typescript
// This no longer works
EzRez<
  { verificationCode: string },
  'USER_NOT_FOUND' | 'OTP_EMAIL_SEND_FAILED' | 'DATABASE_ERROR',
  UserErrorData | OtpErrorData | DatabaseErrorData
>;
```

**Problem**: The association between error types and their data types was loose. TypeScript couldn't enforce that `'USER_NOT_FOUND'` always has `UserErrorData`.

### New Unified Pattern

```typescript
EzRez<
  { verificationCode: string },
  | { type: 'USER_NOT_FOUND'; message: string; data: UserErrorData }
  | { type: 'OTP_EMAIL_SEND_FAILED'; message: string; data: OtpErrorData }
  | { type: 'DATABASE_ERROR'; message: string; data: DatabaseErrorData }
>;
```

**Benefits**:

- Each error type is explicitly paired with its data type
- Better type safety and autocomplete
- More readable and self-documenting
- Easier to see all possible errors at a glance
- TypeScript enforces the relationship between error type and data

## Runtime API (Unchanged)

The runtime API for creating failures remains the same:

```typescript
// Creating failures at runtime
authEzFail('ERROR_TYPE', { some: 'data' });
// or
ezFail('ERROR_TYPE', 'Error message', { some: 'data' });
```

## Examples

### Basic Usage

```typescript
// Define a function with precise error types
async function fetchUser(
  id: string
): Promise<
  EzRez<
    { user: User },
    | { type: 'USER_NOT_FOUND'; message: string; data: { userId: string } }
    | { type: 'DATABASE_ERROR'; message: string; data: { operation: string } }
  >
> {
  try {
    const user = await db.findUser(id);
    if (!user) {
      return authEzFail('USER_NOT_FOUND', { userId: id });
    }
    return ezOk({ user });
  } catch (error) {
    return authEzFail('DATABASE_ERROR', { operation: 'findUser' });
  }
}
```

### Using Helper Types

Instead of writing out the full error objects every time, use the exported error type aliases:

```typescript
import { DatabaseError, UserNotFoundError, ValidationError } from '~/lib/auth/+errors';

function myFunction(): EzRez<{ success: true }, UserNotFoundError | DatabaseError | ValidationError> {
  // implementation
}
```

### Using with Error Maps

The `ErrorMapToFailureUnion` helper type converts an error map to the unified pattern:

```typescript
import { ErrorMapToFailureUnion } from '~/utils/ezrez-utils';

const MY_ERROR_MAP = {
  USER_NOT_FOUND: { message: 'User not found', data: {} satisfies { userId?: string } },
  INVALID_EMAIL: { message: 'Invalid email', data: {} satisfies { email?: string } },
} as const satisfies ErrorMap;

type MyErrors = ErrorMapToFailureUnion<typeof MY_ERROR_MAP>;
// Results in:
// | { type: 'USER_NOT_FOUND'; message: string; data: { userId?: string } }
// | { type: 'INVALID_EMAIL'; message: string; data: { email?: string } }

function myFunction(): EzRez<{ success: true }, MyErrors> {
  // implementation
}
```

## Migration Guide

1. **Find all `EzRez` type annotations** with 3 parameters in your codebase
2. **Convert to the unified pattern**:
   - Combine the 2nd and 3rd parameters into a union of error objects
   - Each error object should have `type`, `message`, and optionally `data`
3. **Use helper types** from `+errors.ts` to avoid repetition
4. **Keep the runtime code unchanged** - `ezFail` and `authEzFail` calls remain the same

### Example Migration

```typescript
// Before
function foo(): Promise<
  EzRez<{ result: string }, 'USER_NOT_FOUND' | 'DATABASE_ERROR', UserErrorData | DatabaseErrorData>
> {
  // ...
}

// After
function foo(): Promise<EzRez<{ result: string }, UserNotFoundError | DatabaseError>> {
  // ...
}
```

## Technical Details

### Type Definitions

The core `EzRez` type is now simplified:

```typescript
export type EzRez<V extends SomeValue = SomeValue, F extends EzFailureObject = EzFailureObject> =
  | EzRezOk<V>
  | EzRezFail<F>;
```

### New Helper Types

- `EzFailureObject<T, D>`: Defines the structure of an error object
- `ErrorMapToFailureUnion<M>`: Converts an error map to a failure union type
- `ExtractFailureType<F>`: Extracts the type string from a failure object
- `ExtractFailureData<F>`: Extracts the data type from a failure object

### Predefined Error Types

Common errors are exported from `~/lib/auth/+errors.ts`:

- `DatabaseError`
- `UserNotFoundError`
- `UserAlreadyExistsError`
- `InvalidCredentialsError`
- `InvalidTokenFormatError`
- `SessionNotFoundError`
- `SessionExpiredError`
- `InvalidSecretError`
- `ValidationError`
- `PasswordHashFailedError`

## Testing

All 158 ezRez tests pass, ensuring the refactored API works correctly.

## See Also

- `src/lib/ezRez/types.ts` - Core type definitions
- `src/lib/auth/+errors.ts` - Common error type definitions
- `src/lib/auth/otp.ts` - Example usage in production code
- `src/lib/ezRez/methods.test.ts` - Test examples
