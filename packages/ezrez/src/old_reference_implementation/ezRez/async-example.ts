/**
 * Example demonstrating async support in ezRez functions
 */

import {
  ezCatchDefaultAsync,
  ezCatchType,
  ezCatchTypeAsync,
  ezFail,
  ezOk,
  ezOrThen,
  ezTry,
} from "./index";

// Simulate async API calls
async function fetchUser(id: number): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (id === 1) {
    return ezOk({ id: 1, name: "John Doe", email: "john@example.com" });
  }
  return ezFail("USER_NOT_FOUND", `User with id ${id} not found`);
}

async function fetchUserProfile(userId: number): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (userId === 1) {
    return ezOk({ bio: "Software developer", location: "San Francisco" });
  }
  return ezFail("PROFILE_ERROR", "Profile service unavailable");
}

// Example 1: ezTry with async catchers
async function example1() {
  console.log("\n=== Example 1: ezTry with async catchers ===");

  const userNotFoundCatcher = ezCatchTypeAsync("USER_NOT_FOUND", async () => {
    console.log("🔄 Attempting to create default user...");
    await new Promise((resolve) => setTimeout(resolve, 50));
    return ezOk({ id: 0, name: "Anonymous", email: "anonymous@example.com" });
  });

  const profileErrorCatcher = ezCatchTypeAsync("PROFILE_ERROR", async () => {
    console.log("🔄 Using cached profile...");
    await new Promise((resolve) => setTimeout(resolve, 30));
    return ezOk({ bio: "No bio available", location: "Unknown" });
  });

  const tryFn = ezTry(userNotFoundCatcher, profileErrorCatcher);

  // Test with existing user
  const existingUser = await fetchUser(1);
  const handledUser = await tryFn(existingUser);
  console.log("✅ Existing user:", handledUser);

  // Test with non-existing user (triggers async recovery)
  const nonExistingUser = await fetchUser(999);
  const recoveredUser = await tryFn(nonExistingUser);
  console.log("🚀 Recovered user:", recoveredUser);
}

// Example 2: ezOrThen with async handler
async function example2() {
  console.log("\n=== Example 2: ezOrThen with async handler ===");

  const userResult = await fetchUser(999);

  const result = await ezOrThen(userResult, async (failure) => {
    console.log(`🔄 Handling failure: ${failure.type} - ${failure.message}`);
    await new Promise((resolve) => setTimeout(resolve, 75));

    // Try alternative data source
    return ezOk({
      id: -1,
      name: "Fallback User",
      email: "fallback@example.com",
    });
  });

  console.log("🚀 Final result:", result);
}

// Example 3: Mixed sync and async catchers
async function example3() {
  console.log("\n=== Example 3: Mixed sync and async catchers ===");

  // Sync catcher for immediate fallback
  const syncCatcher = ezCatchType("VALIDATION_ERROR", () => {
    console.log("⚡ Quick sync recovery");
    return ezOk("Sync fallback value");
  });

  // Async catcher for complex recovery
  const asyncCatcher = ezCatchTypeAsync("USER_NOT_FOUND", async () => {
    console.log("🔄 Complex async recovery...");
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simulate calling another service
    const profileResult = await fetchUserProfile(1);
    if (profileResult.isSuccess) {
      return ezOk(`Recovered from profile: ${profileResult.value.bio}`);
    }
    return ezOk("Default recovered value");
  });

  const tryFn = ezTry(syncCatcher, asyncCatcher);

  // Test async catcher
  const userError = ezFail("USER_NOT_FOUND", "User not found");
  const asyncResult = await tryFn(userError);
  console.log("🚀 Async recovery result:", asyncResult);

  // Test sync catcher
  const validationError = ezFail("VALIDATION_ERROR", "Invalid input");
  const syncResult = await tryFn(validationError);
  console.log("⚡ Sync recovery result:", syncResult);
}

// Example 4: Complex pipeline with error recovery
async function example4() {
  console.log("\n=== Example 4: Complex async pipeline ===");

  async function processUser(userId: number) {
    // Step 1: Fetch user
    const userResult = await fetchUser(userId);

    // Step 2: Handle user fetch errors with async recovery
    const recoveredUser = await ezOrThen(userResult, async (failure) => {
      console.log(`🔄 User fetch failed: ${failure.message}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return ezOk({ id: 0, name: "Guest", email: "guest@example.com" });
    });

    if (!recoveredUser.isSuccess) {
      return recoveredUser;
    }

    // Step 3: Fetch profile with error handling
    const profileResult = await fetchUserProfile(recoveredUser.value.id);

    const profileCatcher = ezCatchDefaultAsync(async () => {
      console.log("🔄 Profile fetch failed, using default...");
      await new Promise((resolve) => setTimeout(resolve, 30));
      return ezOk({ bio: "Default bio", location: "Unknown" });
    });

    const tryProfile = ezTry(profileCatcher);
    const finalProfile = await tryProfile(profileResult);

    // Step 4: Combine results
    if (finalProfile.isSuccess) {
      return ezOk({
        user: recoveredUser.value,
        profile: finalProfile.value,
      });
    }

    return finalProfile;
  }

  // Test with existing user
  console.log("🔍 Processing existing user...");
  const result1 = await processUser(1);
  console.log("✅ Result:", result1);

  // Test with non-existing user
  console.log("🔍 Processing non-existing user...");
  const result2 = await processUser(999);
  console.log("🚀 Result:", result2);
}

// Type inference demonstration
async function typeInferenceDemo() {
  console.log("\n=== Type Inference Demo ===");

  // Sync handler - returns non-Promise
  const syncCatcher = ezCatchType("ERROR", () => ezOk("sync"));
  const syncTryFn = ezTry(syncCatcher);
  const syncResult = syncTryFn(ezFail("ERROR", "test")); // No await needed
  console.log("⚡ Sync result (no Promise):", syncResult);

  // Async handler - returns Promise
  const asyncCatcher = ezCatchTypeAsync("ERROR", async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return ezOk("async");
  });
  const asyncTryFn = ezTry(asyncCatcher);
  const asyncResult = await asyncTryFn(ezFail("ERROR", "test")); // Await required
  console.log("🚀 Async result (Promise):", asyncResult);

  // Mixed handlers - returns Promise (because at least one is async)
  const mixedTryFn = ezTry(syncCatcher, asyncCatcher);
  const mixedResult = await mixedTryFn(ezFail("ERROR", "test")); // Await required
  console.log("🔄 Mixed result (Promise due to async):", mixedResult);
}

// Run all examples
async function runAllExamples() {
  console.log("🎉 ezRez Async Support Examples\n");

  await example1();
  await example2();
  await example3();
  await example4();
  await typeInferenceDemo();

  console.log("\n✨ All examples completed!");
}

void runAllExamples;
