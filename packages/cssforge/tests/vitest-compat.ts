import { expect, test } from "vitest";
import type { TestContext } from "vitest";

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
