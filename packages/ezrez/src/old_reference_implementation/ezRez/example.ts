import { ezCatchDefault, ezCatchType, ezTry } from ".";
import { ezFail, ezOk } from "./core";

//EXAMPLE CODE
function divide(a: number, b: number) {
  if (b <= 0) {
    return ezFail("divideError", "a must be greater than 0", { a, b });
  } else {
    return ezOk(a / b);
  }
}

type DivideEzResult = ReturnType<typeof divide>;
//TODO: WORK ON THE EXAMPLES !!!!!!!!!!!!!!!!!!!!!!!!!!!
function example() {
  const fooMatcher = ezTry<DivideEzResult>(
    ezCatchType<DivideEzResult>("divideError", (failRez) =>
      ezFail("dividedByZeroError", "Denominator must be greater than 0", {
        numerator: failRez.failure.data.a,
        denominator: failRez.failure.data.b,
      }),
    ),
    ezCatchType("divideError", (failRez) =>
      ezFail("dividedByZeroError2", "Denominator must be greater than 0", {
        n: failRez.failure.data.a,
        d: failRez.failure.data.b,
      }),
    ),
    {
      filter: (failure) => failure.type === "divideError",
      handler: (failRez) => {
        const t = ezFail("dividedByZeroError2", "a must be greater than 0", {
          n: failRez.failure.data.a,
          d: failRez.failure.data.b,
        });
        console.error(t);
        return t;
      },
      isAsync: false,
    },
    ezCatchDefault(() => ezOk("invalid")),
  );

  const foo = fooMatcher(divide(1, 2));

  if (foo.isSuccess) {
    if (typeof foo.value === "number") {
      console.log(foo.value.toFixed(2));
    }
  } else {
    // if ('numerator' in foo.failure.data) {
    if (foo.failure.type === "dividedByZeroError2") {
      // @ts-expect-error - Type narrowing doesn't work properly for union types with data property
      console.error(foo.failure.data.n);
    } else {
      console.error("Unknown error");
    }
  }
}

void example;

// const okOnlyTry = rezTry<DivideEzResult, EzRezOk<number>>(
//   rezCatchType('divideError', _failure => ezOk(10)),
//   rezCatchDefault(() => ezOk(0))
// );

// const okOnlyTryRez = okOnlyTry(divide(1, 2));

// // still need to test for success, even though we know it will be true
// if (okOnlyTryRez.isSuccess) {
//   console.log(okOnlyTryRez.value);
// } else {
//   console.error('Unknown error');
// }

// const okOnlyTryOr = getTryOr<DivideEzResult, EzRezOk<number>>(
//   [rezCatchType('divideError', _failure => ezOk(10)), rezCatchDefault(() => ezOk(0))],
//   0
// );

// const okOnlyTryORez = okOnlyTryOr(divide(1, 2));

// // EXAMPLE: New single RezCatch overload with improved type inference
// console.log('\n--- Single RezCatch Overload Example ---');

// // Single catcher with improved type inference
// const singleCatcher = rezTry(rezCatchType('divideError', () => ezOk('recovered from division error')));

// const singleCatcherResult = singleCatcher(divide(10, 0));
// console.log('Single catcher result:', singleCatcherResult);

// // Multiple catchers (existing behavior still works)
// const multipleCatchers = rezTry(
//   rezCatchType('divideError', () => ezOk('recovered')),
//   rezCatchDefault(() => ezOk('fallback'))
// );

// const multipleCatchersResult = multipleCatchers(divide(10, 0));
// console.log('Multiple catchers result:', multipleCatchersResult);
