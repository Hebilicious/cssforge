import { assertSettingsKeys, validateName } from "../helpers.ts";
import type { Diagnostic, DiagnosticCode, Output, ResolveMap } from "../lib.ts";

/**
 * Settings for a group of durations.
 */
export interface MotionDurationSettings {
	/**
	 * Marks a group of modal and drawer transitions, which may take up to 500ms
	 * instead of the 300ms a UI transition should stay under. It only changes the
	 * build warnings: the tokens and the CSS stay the same.
	 * @default false
	 */
	long?: boolean;
}

/**
 * The motion configuration object.
 */
export interface MotionConfig {
	/**
	 * Groups of durations. Each `value` maps a name to a non-negative time in `ms`
	 * or `s`, such as `"120ms"` or `"0.2s"`.
	 */
	duration?: {
		[group: string]: {
			value: { [name: string]: string };
			settings?: MotionDurationSettings;
		};
	};
	/**
	 * Groups of easing functions. Each `value` maps a name to a CSS easing
	 * function: a keyword, `cubic-bezier()`, `steps()` or `linear()`.
	 */
	easing?: {
		[group: string]: { value: { [name: string]: string } };
	};
}

/**
 * The two easing curves good-css defines for UI motion, to spread into an
 * easing group's `value`. They are not added unless a config spreads them.
 * @example
 * ```ts
 * defineConfig({ motion: { easing: { ui: { value: { ...goodCssEasings } } } } });
 * ```
 */
export const goodCssEasings = Object.freeze({
	out: "cubic-bezier(0.23, 1, 0.32, 1)",
	inOut: "cubic-bezier(0.77, 0, 0.175, 1)",
} as const);

const MAX_UI_DURATION_MS = 300;
const MAX_LONG_DURATION_MS = 500;

const NUMBER = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)`;
const DURATION_PATTERN = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/;
const NUMBER_PATTERN = new RegExp(`^${NUMBER}$`);
const PERCENTAGE_PATTERN = new RegExp(`^${NUMBER}%$`);
const EASING_KEYWORDS = [
	"linear",
	"ease",
	"ease-in",
	"ease-out",
	"ease-in-out",
	"step-start",
	"step-end",
];
const STEP_POSITIONS = [
	"jump-start",
	"jump-end",
	"jump-none",
	"jump-both",
	"start",
	"end",
];
/** The control points of each keyword that is a cubic Bézier curve. */
const KEYWORD_CURVES: Record<string, BezierPoints> = {
	linear: [0, 0, 1, 1],
	ease: [0.25, 0.1, 0.25, 1],
	"ease-in": [0.42, 0, 1, 1],
	"ease-out": [0, 0, 0.58, 1],
	"ease-in-out": [0.42, 0, 0.58, 1],
};

type BezierPoints = [x1: number, y1: number, x2: number, y2: number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const invalid = (path: string, expected: string, value: unknown) =>
	new Error(
		`Invalid configuration at "${path}": expected ${expected}, received ${JSON.stringify(value)}.`,
	);

const readRecord = (value: unknown, path: string, expected: string) => {
	if (!isRecord(value)) throw invalid(path, expected, value);
	return value;
};

const assertKeys = (value: Record<string, unknown>, allowed: string[], path: string) => {
	const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unknown.length === 0) return;
	throw new Error(
		`Invalid configuration at "${path}": unknown key ${unknown.map((key) => `"${key}"`).join(", ")}. Use ${allowed.map((key) => `"${key}"`).join(", ")}.`,
	);
};

/** Reads a duration in ms. CSS needs a unit on a time, so a bare `0` is rejected. */
const readDuration = (value: unknown, path: string): number => {
	const match = typeof value === "string" ? DURATION_PATTERN.exec(value) : null;
	if (!match) {
		throw invalid(
			path,
			'a non-negative time in "ms" or "s", such as "120ms" or "0.2s"',
			value,
		);
	}
	const amount = Number(match[1]);
	return match[2] === "s" ? Math.round(amount * 1e6) / 1e3 : amount;
};

const readArguments = (value: string, name: string): string[] | undefined => {
	if (!value.startsWith(`${name}(`) || !value.endsWith(")")) return undefined;
	return value
		.slice(name.length + 1, -1)
		.split(",")
		.map((argument) => argument.trim());
};

const readCubicBezier = (args: string[]): BezierPoints | undefined => {
	if (args.length !== 4 || !args.every((arg) => NUMBER_PATTERN.test(arg)))
		return undefined;
	const [x1, y1, x2, y2] = args.map(Number) as BezierPoints;
	if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return undefined;
	return [x1, y1, x2, y2];
};

const isSteps = (args: string[]) => {
	const [count, position, ...rest] = args;
	if (rest.length > 0 || !count || !/^\d+$/.test(count)) return false;
	if (position === undefined) return Number(count) >= 1;
	if (!STEP_POSITIONS.includes(position)) return false;
	return Number(count) >= (position === "jump-none" ? 2 : 1);
};

const isPercentages = (parts: string[]) =>
	parts.length <= 2 && parts.every((part) => PERCENTAGE_PATTERN.test(part));

/** A number before or after up to two percentages. */
const isLinearStop = (stop: string) => {
	const parts = stop.split(/\s+/);
	if (NUMBER_PATTERN.test(parts[0] ?? "")) return isPercentages(parts.slice(1));
	return NUMBER_PATTERN.test(parts.at(-1) ?? "") && isPercentages(parts.slice(0, -1));
};

const isLinear = (args: string[]) => args.length >= 2 && args.every(isLinearStop);

/**
 * Reads an easing function and returns its Bézier control points, or `null`
 * for `steps()`, `linear()` and the step keywords, which have none.
 */
const readEasing = (value: unknown, path: string): BezierPoints | null => {
	const fail = () =>
		invalid(
			path,
			`a CSS easing function: ${EASING_KEYWORDS.join(", ")}, cubic-bezier(x1, y1, x2, y2) with x1 and x2 between 0 and 1, steps() or linear()`,
			value,
		);
	if (typeof value !== "string") throw fail();
	if (EASING_KEYWORDS.includes(value)) return KEYWORD_CURVES[value] ?? null;

	const bezierArgs = readArguments(value, "cubic-bezier");
	if (bezierArgs) {
		const points = readCubicBezier(bezierArgs);
		if (!points) throw fail();
		return points;
	}
	const stepArgs = readArguments(value, "steps");
	if (stepArgs && isSteps(stepArgs)) return null;
	const linearArgs = readArguments(value, "linear");
	if (linearArgs && isLinear(linearArgs)) return null;
	throw fail();
};

type Point = [x: number, y: number];

const slope = ([ax, ay]: Point, [bx, by]: Point) => (by - ay) / (bx - ax);

/** The first control point that does not sit on `end`, or the other end. */
const nearestDistinct = (end: Point, points: Point[]): Point =>
	points.find(([x, y]) => x !== end[0] || y !== end[1]) ??
	(end[0] === 0 ? [1, 1] : [0, 0]);

/**
 * A curve is ease-in shaped when it starts slower than linear and ends faster:
 * its slope at 0 is below 1 and its slope at 1 is above 1. The slope at an end
 * is taken toward the nearest control point that does not sit on that end.
 * This keeps `ease-in-out`, whose slope is 0 at both ends, and `ease`, which
 * ends at 0, from warning.
 */
const isEaseInShaped = ([x1, y1, x2, y2]: BezierPoints) => {
	const p1: Point = [x1, y1];
	const p2: Point = [x2, y2];
	const start = slope([0, 0], nearestDistinct([0, 0], [p1, p2]));
	const end = slope(nearestDistinct([1, 1], [p2, p1]), [1, 1]);
	return start < 1 && end > 1;
};

const formatMs = (ms: number) => `${Number(ms.toFixed(3))}ms`;

/**
 * Generate CSS custom properties for motion durations and easing functions.
 *
 * Generated variable naming:
 * - Duration: `--motion-duration-{group}-{name}`, resolved as `motion.duration.{group}.{name}`
 * - Easing: `--motion-easing-{group}-{name}`, resolved as `motion.easing.{group}.{name}`
 *
 * @example
 * ```ts
 * const { css, diagnostics } = processMotion({
 *   duration: {
 *     ui: { value: { press: "120ms", dropdown: "200ms" } },
 *     overlay: { value: { modal: "400ms" }, settings: { long: true } },
 *   },
 *   easing: { ui: { value: { ...goodCssEasings } } },
 * });
 * ```
 */
export function processMotion(motion: MotionConfig): Output {
	const cssOutput: string[] = [];
	const resolveMap: ResolveMap = new Map();
	const diagnostics: Diagnostic[] = [];
	const moduleKey = "motion";

	const config = readRecord(motion, moduleKey, "an object");
	assertKeys(config, ["duration", "easing"], moduleKey);

	const readGroups = <S>(
		kind: "duration" | "easing",
		code: DiagnosticCode,
		readSettings: (group: Record<string, unknown>, path: string) => S,
		check: (value: unknown, path: string, settings: S) => string | undefined,
	) => {
		if (config[kind] === undefined) return;
		const kindPath = `${moduleKey}.${kind}`;
		const groups = readRecord(config[kind], kindPath, "an object of groups");
		for (const [groupName, groupConfig] of Object.entries(groups)) {
			const groupPath = `${kindPath}.${groupName}`;
			validateName(groupName, groupPath);
			const group = readRecord(groupConfig, groupPath, "an object with a value");
			assertKeys(group, ["value", "settings"], groupPath);
			const settings = readSettings(group, `${groupPath}.settings`);
			const tokens = readRecord(group.value, `${groupPath}.value`, "an object of tokens");
			for (const [name, value] of Object.entries(tokens)) {
				const path = `${groupPath}.${name}`;
				validateName(name, path);
				const message = check(value, path, settings);
				if (message) diagnostics.push({ code, severity: "warning", path, message });
				const key = `--${moduleKey}-${kind}-${groupName}-${name}`;
				const variable = `${key}: ${value};`;
				cssOutput.push(variable);
				resolveMap.set(path, {
					variable,
					key,
					value: String(value),
					sourcePath: path,
					type: kind,
					tier: "primitive",
				});
			}
		}
	};

	readGroups(
		"duration",
		"motion-long-duration",
		(group, path) => {
			assertSettingsKeys(group.settings, ["long"], path);
			const long = isRecord(group.settings) ? group.settings.long : undefined;
			if (long !== undefined && typeof long !== "boolean") {
				throw invalid(`${path}.long`, "true or false", long);
			}
			return long === true;
		},
		(value, path, long) => {
			const ms = readDuration(value, path);
			const limit = long ? MAX_LONG_DURATION_MS : MAX_UI_DURATION_MS;
			if (ms <= limit) return undefined;
			return long
				? `Motion duration ${path} is ${formatMs(ms)}, over the ${limit}ms a modal or drawer transition should take, even with settings.long. Shorten it.`
				: `Motion duration ${path} is ${formatMs(ms)}, over the ${limit}ms a UI transition should take. Shorten it, or set the group's settings.long for a modal or drawer, which allows up to ${MAX_LONG_DURATION_MS}ms.`;
		},
	);

	readGroups(
		"easing",
		"motion-ease-in",
		(group, path) => assertSettingsKeys(group.settings, [], path),
		(value, path) => {
			const points = readEasing(value, path);
			if (!points || !isEaseInShaped(points)) return undefined;
			return `Motion easing ${path} is ease-in shaped: it starts slow and ends fast, which reads as lag on UI. Use an ease-out curve such as ${goodCssEasings.out}, or ${goodCssEasings.inOut} for movement on screen.`;
		},
	);

	return { css: { root: cssOutput.join("\n") }, resolveMap, diagnostics };
}
