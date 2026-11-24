/**
 * The capabilities of the CSS Forge tools. The command line (`cssforge`), the
 * MCP server (`cssforge mcp`) and code (the `library` target) all use them, and
 * the catalog `cssforge.acidcat.json` describes them.
 *
 * @example
 * ```ts
 * import {
 *   createSession,
 *   cssforge,
 *   tokensBuild,
 *   toJsonSchema,
 * } from "@hebilicious/cssforge/capabilities";
 *
 * await using session = createSession(cssforge, {
 *   target: "library",
 *   context: { cwd: process.cwd() },
 *   toJsonSchema,
 * });
 * const result = await session.call(tokensBuild, { mode: "css" });
 * if (!result.ok) console.error(result.error.message);
 * ```
 *
 * @module
 */

import { resolve } from "node:path";
import type {
	App,
	Capability,
	Emitted,
	EventDefinition,
	Result,
	ToJsonSchema,
} from "@acid-cat/core-ts";
import {
	capabilitiesFor,
	cliAlias,
	cliAliasDefault,
	defineApp,
	eventsFor,
	fail,
	ok,
} from "@acid-cat/core-ts";
import { z } from "zod";
import {
	type BuildReport,
	type BuildSettings,
	buildOutputs,
	type CheckReport,
	checkConfig,
	defaultConfigPath,
	defaultOutputPaths,
	ForgeError,
	type ForgeFailureTag,
	type GenerateReport,
	generateOutput,
	type OutputFormat,
	type OutputMode,
	outputFormats,
	outputModes,
	type StyleDictionaryValueMode,
	styleDictionaryValueModes,
	watchOutputs,
} from "./forge.ts";
import { type ColorFormat, diagnosticCodes } from "./lib.ts";
import { supportedColorFormats } from "./modules/colors.ts";
import { syncCapabilities } from "./sync/capabilities.ts";
import type { RemoteAdapter } from "./sync/remote.ts";

/**
 * `createSession` opens a session on {@link cssforge}, for typed calls from
 * code. A call gives `{ ok: false, error }` for a failure of the capability,
 * and rejects with a `CallFailureError` for an input that is not valid, a
 * cancellation or a defect.
 */
export { CallFailureError, createSession } from "@acid-cat/core-ts";
export type { ListedToken, TokenKind } from "./generator.ts";
export * from "./sync/capabilities.ts";
export { type PaperOptions, paperAdapter } from "./sync/paper.ts";
export type {
	BaseEntry,
	Decision,
	InboxItem,
	ModeValues,
	Operation,
	RemoteToken,
} from "./sync/plan.ts";
export { DEFAULT_MODE } from "./sync/plan.ts";
export type {
	ApplyResult,
	RemoteAdapter,
	RemoteOptions,
	RemoteSession,
	RemoteTarget,
	TokenMapping,
} from "./sync/remote.ts";
export { RemoteError } from "./sync/remote.ts";

/** The JSON Schema of a schema of {@link cssforge}, for the catalog and the bindings. */
export const toJsonSchema: ToJsonSchema = (schema) => {
	if (!(schema instanceof z.ZodType))
		throw new Error("Each CSS Forge schema is a Zod schema.");
	// The input form: a property with a default is optional for the caller.
	return z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" });
};

/** The services of the CSS Forge capabilities. */
export interface ForgeContext {
	/** The directory that relative paths resolve against, when an input gives no `root`. */
	cwd: string;
	/** The remotes that token sync knows. The default is the Paper remote. */
	remotes?: readonly RemoteAdapter[];
}

// --- Schemas -------------------------------------------------------------------------------

/** An enum whose error names the value received. */
const oneOf = <const Values extends readonly [string, ...string[]]>(values: Values) =>
	z.enum(values, {
		error: (issue) =>
			`Received ${JSON.stringify(issue.input)}. Expected one of: ${values.join(", ")}.`,
	});

const commonShape = {
	config: z
		.string()
		.min(1)
		.default(defaultConfigPath)
		.describe("The path of the configuration file."),
	root: z
		.string()
		.min(1)
		.optional()
		.describe(
			"The directory that the relative paths of the input resolve against. The default is the working directory of the tools.",
		),
	"color-formats": z
		.array(oneOf(supportedColorFormats as [ColorFormat, ...ColorFormat[]]))
		.default([])
		.describe(
			"Extra color formats generated beside oklch(), added to the formats that the configuration declares.",
		),
};

const styleDictionaryValueMode = oneOf(styleDictionaryValueModes)
	.default("resolved")
	.describe(
		"How the Style Dictionary output writes values: css-reference for usage matching, resolved for previews and builds.",
	);

const outputPath = (format: OutputFormat, label: string) =>
	z
		.string()
		.min(1)
		.default(defaultOutputPaths[format])
		.describe(`The path of the ${label} file.`);

const buildInput = z.strictObject({
	...commonShape,
	mode: oneOf(outputModes)
		.default("all")
		.describe("The output to write: one format, or all of them."),
	css: outputPath("css", "CSS"),
	json: outputPath("json", "JSON"),
	ts: outputPath("ts", "TypeScript"),
	"style-dictionary": outputPath("style-dictionary", "Style Dictionary token JSON"),
	"style-dictionary-value-mode": styleDictionaryValueMode,
});

const generateInput = z.strictObject({
	...commonShape,
	format: oneOf(outputFormats).default("css").describe("The output to generate."),
	"style-dictionary-value-mode": styleDictionaryValueMode,
});

const checkInput = z.strictObject(commonShape);

const reportShape = {
	diagnostics: z.array(
		z
			.strictObject({
				code: z.enum(diagnosticCodes).describe("A stable identifier of the warning."),
				severity: z.literal("warning"),
				path: z.string().describe("The configuration path of the value."),
				message: z.string().describe("What is wrong, and how to fix it."),
			})
			.describe("A warning about a value that generates, but likely not as intended."),
	),
	dependencies: z
		.array(z.string())
		.describe(
			"The absolute paths of the configuration and the local modules it imports.",
		),
};

const buildReportShape = {
	files: z
		.array(
			z.strictObject({
				format: z.enum(outputFormats),
				path: z.string().describe("The absolute path of the file."),
			}),
		)
		.describe("The files written."),
	...reportShape,
};

const checkReport = z.strictObject(reportShape);
const buildReport = z.strictObject(buildReportShape);
const generateReport = z.strictObject({
	format: z.enum(outputFormats),
	content: z.string().describe("The generated file content."),
	...reportShape,
});

const failureShape = {
	message: z.string(),
	path: z.string().optional().describe("The file that the failure concerns."),
};

const failure = <Tag extends ForgeFailureTag>(tag: Tag, description: string) =>
	z.strictObject({ _tag: z.literal(tag).describe(description), ...failureShape });

const readFailures = {
	ConfigLoadFailed: failure(
		"ConfigLoadFailed",
		"The configuration file could not be found or evaluated, or it has no default export object.",
	),
	InvalidConfig: failure(
		"InvalidConfig",
		"The configuration loaded, but CSS Forge rejects a value in it.",
	),
};
const buildFailures = {
	...readFailures,
	WriteFailed: failure("WriteFailed", "An output file could not be written."),
};

const builtPayload = z.discriminatedUnion("ok", [
	z.strictObject({ ok: z.literal(true), ...buildReportShape }),
	z.strictObject({
		ok: z.literal(false),
		failure: z
			.discriminatedUnion("_tag", [
				buildFailures.ConfigLoadFailed,
				buildFailures.InvalidConfig,
				buildFailures.WriteFailed,
			])
			.describe("Why the build failed."),
	}),
]);

// --- Types ---------------------------------------------------------------------------------
//
// JSR needs an explicit type for each export, so the types are written here. The annotation of
// each capability checks its schemas against them.

/** The members of every input, with the defaults filled in. */
export interface CommonInput {
	config: string;
	root?: string;
	"color-formats": ColorFormat[];
}

/** The input of `tokens.build` and of the event `tokens.built`, with the defaults filled in. */
export interface BuildInput extends CommonInput {
	mode: OutputMode;
	css: string;
	json: string;
	ts: string;
	"style-dictionary": string;
	"style-dictionary-value-mode": StyleDictionaryValueMode;
}

/** The input of `tokens.generate`, with the defaults filled in. */
export interface GenerateInput extends CommonInput {
	format: OutputFormat;
	"style-dictionary-value-mode": StyleDictionaryValueMode;
}

/** The input of `config.check`, with the defaults filled in. */
export type CheckInput = CommonInput;

/** A failure of a capability: its tag, a message for people and agents, and the file. */
export interface Failure<Tag extends ForgeFailureTag> {
	_tag: Tag;
	message: string;
	/** The file that the failure concerns. */
	path?: string;
}

/** The failures of a capability that reads a configuration. */
export type ReadFailures = {
	ConfigLoadFailed: Failure<"ConfigLoadFailed">;
	InvalidConfig: Failure<"InvalidConfig">;
};

/** The failures of a capability that writes outputs. */
export type BuildFailures = ReadFailures & {
	WriteFailed: Failure<"WriteFailed">;
};

type ReadFailure = Failure<keyof ReadFailures>;
type BuildFailure = Failure<ForgeFailureTag>;

/** An occurrence of `tokens.built`: the report of a build, or the failure that stopped it. */
export type BuiltPayload =
	| ({ ok: true } & BuildReport)
	| { ok: false; failure: BuildFailure };

// --- Operations ------------------------------------------------------------------------------

/** Resolves a path of an input against its root. */
const pathIn = (context: ForgeContext, input: CommonInput) => (path: string) =>
	resolve(context.cwd, input.root ?? ".", path);

const failureOf = (error: ForgeError): BuildFailure => ({
	_tag: error.tag,
	message: error.message,
	...(error.path === undefined ? {} : { path: error.path }),
});

/** Runs an operation, and gives a {@link ForgeError} as a failure. Other errors are defects. */
async function attempt<Value, Failure extends { readonly _tag: string }>(
	operation: () => Promise<Value>,
	toFailure: (error: ForgeError) => Failure,
): Promise<Result<Value, Failure>> {
	try {
		return ok(await operation());
	} catch (error) {
		if (error instanceof ForgeError) return fail(toFailure(error));
		throw error;
	}
}

/** A read operation can only fail to load or validate. */
const readFailureOf = (error: ForgeError): ReadFailure => {
	const failure = failureOf(error);
	if (failure._tag === "WriteFailed") throw error;
	return { ...failure, _tag: failure._tag };
};

const buildSettingsOf = (context: ForgeContext, input: BuildInput): BuildSettings => {
	const path = pathIn(context, input);
	return {
		config: path(input.config),
		mode: input.mode,
		outputs: {
			css: path(input.css),
			json: path(input.json),
			ts: path(input.ts),
			"style-dictionary": path(input["style-dictionary"]),
		},
		colorFormats: input["color-formats"],
		styleDictionaryValueMode: input["style-dictionary-value-mode"],
	};
};

// --- Capabilities ----------------------------------------------------------------------------

const capability = capabilitiesFor<ForgeContext>();
const event = eventsFor<ForgeContext>();

/** The targets that use every capability. */
const everyone = ["cli", "mcp", "library"];

/** `cssforge build`: generate the outputs of a configuration and write them. */
export const tokensBuild: Capability<
	ForgeContext,
	BuildInput,
	BuildReport,
	BuildFailures,
	never,
	"tokens.build",
	Partial<BuildInput>
> = capability({
	id: "tokens.build",
	description:
		"Generate the outputs of a CSS Forge configuration and write them to files: CSS custom properties, JSON, TypeScript and Style Dictionary tokens. Every output is generated before the first file is written, so an invalid configuration leaves the previous files in place. The result lists the files written and the warnings of the configuration.",
	audience: everyone,
	destructive: true,
	idempotent: true,
	input: buildInput,
	output: buildReport,
	failures: buildFailures,
	run: (input, { context }) =>
		attempt(() => buildOutputs(buildSettingsOf(context, input)), failureOf),
});

/** `cssforge generate`: give one output as text. */
export const tokensGenerate: Capability<
	ForgeContext,
	GenerateInput,
	GenerateReport,
	ReadFailures,
	never,
	"tokens.generate",
	Partial<GenerateInput>
> = capability({
	id: "tokens.generate",
	description:
		"Generate one output of a CSS Forge configuration and give it as text, with the warnings of the configuration. Writes no file.",
	audience: everyone,
	readOnly: true,
	input: generateInput,
	output: generateReport,
	failures: readFailures,
	run: (input, { context }) =>
		attempt(
			() =>
				generateOutput(pathIn(context, input)(input.config), input.format, {
					colorFormats: input["color-formats"],
					styleDictionaryValueMode: input["style-dictionary-value-mode"],
				}),
			readFailureOf,
		),
});

/** `cssforge check`: validate a configuration and give its warnings. */
export const configCheck: Capability<
	ForgeContext,
	CheckInput,
	CheckReport,
	ReadFailures,
	never,
	"config.check",
	Partial<CheckInput>
> = capability({
	id: "config.check",
	description:
		"Load and validate a CSS Forge configuration, and give its warnings: values that generate, but likely not as intended. Writes no file.",
	audience: everyone,
	readOnly: true,
	input: checkInput,
	output: checkReport,
	failures: readFailures,
	run: (input, { context }) =>
		attempt(
			() =>
				checkConfig(pathIn(context, input)(input.config), {
					colorFormats: input["color-formats"],
				}),
			readFailureOf,
		),
});

// --- Events --------------------------------------------------------------------------------

/** `cssforge --watch`: build now and after each change of the configuration. */
export const tokensBuilt: EventDefinition<
	ForgeContext,
	BuildInput,
	BuiltPayload,
	"tokens.built"
> = event({
	id: "tokens.built",
	description:
		"Build the outputs of a CSS Forge configuration now, then again each time the configuration or a local module that it imports changes. Each occurrence is the result of one build: the files written, or the failure. A failed build does not end the subscription. Ending the subscription stops the watch; files already written stay.",
	audience: everyone,
	input: buildInput,
	payload: builtPayload,
	async *subscribe(input, { context, signal }): AsyncGenerator<Emitted<BuiltPayload>> {
		for await (const build of watchOutputs(buildSettingsOf(context, input), signal)) {
			yield {
				data: build.ok
					? { ok: true, ...build.report }
					: { ok: false, failure: failureOf(build.error) },
			};
		}
	},
});

// --- Application -----------------------------------------------------------------------------

/** The CSS Forge application: every capability and event, and the targets that serve them. */
export const cssforge: App<ForgeContext> = defineApp<ForgeContext>({
	title: "CSS Forge",
	description:
		"Generate CSS custom properties, JSON, TypeScript and Style Dictionary tokens from a CSS Forge configuration, and keep the tokens of a design tool in sync with it.",
	targets: {
		cli: {
			bindings: ["cli"],
			description: "The cssforge command line.",
			cli: {
				aliases: {
					// `cssforge` alone, or with only flags, builds.
					build: cliAliasDefault(tokensBuild),
					generate: cliAlias(tokensGenerate),
					check: cliAlias(configCheck),
					"--watch": cliAlias(tokensBuilt),
				},
			},
		},
		mcp: {
			bindings: ["mcp"],
			description: "The MCP server of `cssforge mcp`, for agents.",
		},
		library: {
			bindings: ["typescript"],
			description: "Typed calls from code, through @hebilicious/cssforge/capabilities.",
		},
	},
	capabilities: [tokensBuild, tokensGenerate, configCheck, ...syncCapabilities],
	events: [tokensBuilt],
});
