import type { TestContext } from "vitest";
import { expect, test } from "vitest";

export const Deno = {
	test,
};

export const assert = (condition: unknown, message?: string) => {
	expect(Boolean(condition), message).toBe(true);
};

export const assertEquals = <T>(actual: T, expected: T, message?: string) => {
	expect(actual, message).toEqual(expected);
};

export const assertSnapshot = async (_ctx: TestContext, value: unknown) => {
	expect(value).toMatchSnapshot();
};

/** Asserts that `run` throws and returns the Error so the caller can inspect it. */
export const assertThrows = (run: () => unknown, message?: string): Error => {
	try {
		run();
	} catch (error) {
		expect(error, message).toBeInstanceOf(Error);
		return error as Error;
	}

	throw new Error("Expected the call to throw, but it returned a value.");
};

/** Asserts that `run` does not throw. */
export const assertDoesNotThrow = (run: () => unknown, message?: string) => {
	expect(run, message).not.toThrow();
};
