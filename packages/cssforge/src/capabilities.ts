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
import {
	type BuildReport,
	type BuildSettings,
	buildOutputs,
	type CheckReport,
	checkConfig,
	defaultConfigPath,
	defaultOutputPaths,
	ForgeError,
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
import type { ColorFormat } from "./lib.ts";
import { supportedColorFormats } from "./modules/colors.ts";
import { type JsonSchema, schema } from "./schema.ts";

/**
 * `createSession` opens a session on {@link cssforge}, for typed calls from
 * code. A call gives `{ ok: false, error }` for a failure of the capability,
 * and rejects with a `CallFailureError` for an input that is not valid, a
 * cancellation or a defect.
 */
export { CallFailureError, createSession } from "@acid-cat/core-ts";
export { toJsonSchema } from "./schema.ts";

/** The services of the CSS Forge capabilities. */
export interface ForgeContext {
	/** The directory that relative paths resolve against, when an input gives no `root`. */
	cwd: string;
}

// --- Schemas -------------------------------------------------------------------------------

const configProperty: JsonSchema = {
	type: "string",
	minLength: 1,
	description: "The path of the configuration file.",
	default: defaultConfigPath,
};

const rootProperty: JsonSchema = {
	type: "string",
	minLength: 1,
	description:
		"The directory that the relative paths of the input resolve against. The default is the working directory of the tools.",
};

const colorFormatsProperty: JsonSchema = {
	type: "array",
	items: { type: "string", enum: [...supportedColorFormats] },
	uniqueItems: true,
	description:
		"Extra color formats generated beside oklch(), added to the formats that the configuration declares.",
	default: [],
};

const styleDictionaryValueModeProperty: JsonSchema = {
	type: "string",
	enum: [...styleDictionaryValueModes],
	description:
		"How the Style Dictionary output writes values: css-reference for usage matching, resolved for previews and builds.",
	default: "resolved",
};

const outputPathProperty = (format: OutputFormat, label: string): JsonSchema => ({
	type: "string",
	minLength: 1,
	description: `The path of the ${label} file.`,
	default: defaultOutputPaths[format],
});

/** The members of every input. */
export interface CommonInput {
	config: string;
	root?: string;
	"color-formats": ColorFormat[];
}

const commonProperties: Record<keyof CommonInput, JsonSchema> = {
	config: configProperty,
	root: rootProperty,
	"color-formats": colorFormatsProperty,
};

const objectSchema = <Output>(
	properties: Record<string, JsonSchema>,
	required: string[] = [],
) =>
	schema<Output>({ type: "object", properties, required, additionalProperties: false });

const diagnosticSchema: JsonSchema = {
	type: "object",
	description: "A warning about a value that generates, but likely not as intended.",
	properties: {
		code: { type: "string", description: "A stable identifier of the warning." },
		severity: { type: "string", enum: ["warning"] },
		path: { type: "string", description: "The configuration path of the value." },
		message: { type: "string", description: "What is wrong, and how to fix it." },
	},
	required: ["code", "severity", "path", "message"],
	additionalProperties: false,
};

const reportProperties: Record<keyof CheckReport, JsonSchema> = {
	diagnostics: { type: "array", items: diagnosticSchema },
	dependencies: {
		type: "array",
		items: { type: "string" },
		description:
			"The absolute paths of the configuration and the local modules it imports.",
	},
};

const writtenFileSchema: JsonSchema = {
	type: "object",
	properties: {
		format: { type: "string", enum: [...outputFormats] },
		path: { type: "string", description: "The absolute path of the file." },
	},
	required: ["format", "path"],
	additionalProperties: false,
};

const buildReportProperties: Record<keyof BuildReport, JsonSchema> = {
	files: { type: "array", items: writtenFileSchema, description: "The files written." },
	...reportProperties,
};

const failureSchema = <Tag extends string>(tag: Tag, description: string) =>
	objectSchema<{ message: string; path?: string }>(
		{
			_tag: { const: tag, description },
			message: { type: "string" },
			path: { type: "string", description: "The file that the failure concerns." },
		},
		["_tag", "message"],
	);

const ConfigLoadFailed = failureSchema(
	"ConfigLoadFailed",
	"The configuration file could not be found or evaluated, or it has no default export object.",
);
const InvalidConfig = failureSchema(
	"InvalidConfig",
	"The configuration loaded, but CSS Forge rejects a value in it.",
);
const WriteFailed = failureSchema("WriteFailed", "An output file could not be written.");

const readFailures = { ConfigLoadFailed, InvalidConfig };
const buildFailures = { ConfigLoadFailed, InvalidConfig, WriteFailed };

/** The members of each failure besides its `_tag`. */
export interface FailureDetails {
	message: string;
	/** The file that the failure concerns. */
	path?: string;
}

/** The failures of a capability that reads a configuration. */
export type ReadFailures = {
	ConfigLoadFailed: FailureDetails;
	InvalidConfig: FailureDetails;
};

/** The failures of a capability that writes outputs. */
export type BuildFailures = ReadFailures & {
	WriteFailed: FailureDetails;
};

type ReadFailure = {
	_tag: "ConfigLoadFailed" | "InvalidConfig";
	message: string;
	path?: string;
};
type BuildFailure = { _tag: ForgeError["tag"]; message: string; path?: string };

/** The input of `tokens.build` and of the event `tokens.built`. */
export interface BuildInput extends CommonInput {
	mode: OutputMode;
	css: string;
	json: string;
	ts: string;
	"style-dictionary": string;
	"style-dictionary-value-mode": StyleDictionaryValueMode;
}

const buildInputProperties: Record<keyof BuildInput, JsonSchema> = {
	...commonProperties,
	mode: {
		type: "string",
		enum: [...outputModes],
		description: "The output to write: one format, or all of them.",
		default: "all",
	},
	css: outputPathProperty("css", "CSS"),
	json: outputPathProperty("json", "JSON"),
	ts: outputPathProperty("ts", "TypeScript"),
	"style-dictionary": outputPathProperty(
		"style-dictionary",
		"Style Dictionary token JSON",
	),
	"style-dictionary-value-mode": styleDictionaryValueModeProperty,
};

const BuildInputSchema = objectSchema<BuildInput>(buildInputProperties);

/** The input of `tokens.generate`. */
export interface GenerateInput extends CommonInput {
	format: OutputFormat;
	"style-dictionary-value-mode": StyleDictionaryValueMode;
}

const GenerateInputSchema = objectSchema<GenerateInput>({
	...commonProperties,
	format: {
		type: "string",
		enum: [...outputFormats],
		description: "The output to generate.",
		default: "css",
	},
	"style-dictionary-value-mode": styleDictionaryValueModeProperty,
});

/** The input of `config.check`. */
export type CheckInput = CommonInput;

const CheckInputSchema = objectSchema<CheckInput>(commonProperties);

/** An occurrence of `tokens.built`: the report of a build, or the failure that stopped it. */
export type BuiltPayload =
	| ({ ok: true } & BuildReport)
	| { ok: false; failure: BuildFailure };

const BuiltPayloadSchema = objectSchema<BuiltPayload>(
	{
		ok: { type: "boolean", description: "Whether the build wrote every output." },
		...buildReportProperties,
		failure: {
			type: "object",
			description: "Why the build failed, when ok is false.",
			properties: {
				_tag: {
					type: "string",
					enum: ["ConfigLoadFailed", "InvalidConfig", "WriteFailed"],
				},
				message: { type: "string" },
				path: { type: "string" },
			},
			required: ["_tag", "message"],
			additionalProperties: false,
		},
	},
	["ok"],
);

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
	"tokens.build"
> = capability({
	id: "tokens.build",
	description:
		"Generate the outputs of a CSS Forge configuration and write them to files: CSS custom properties, JSON, TypeScript and Style Dictionary tokens. Every output is generated before the first file is written, so an invalid configuration leaves the previous files in place. The result lists the files written and the warnings of the configuration.",
	audience: everyone,
	input: BuildInputSchema,
	output: objectSchema<BuildReport>(buildReportProperties, [
		"files",
		"diagnostics",
		"dependencies",
	]),
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
	"tokens.generate"
> = capability({
	id: "tokens.generate",
	description:
		"Generate one output of a CSS Forge configuration and give it as text, with the warnings of the configuration. Writes no file.",
	audience: everyone,
	readOnly: true,
	input: GenerateInputSchema,
	output: objectSchema<GenerateReport>(
		{
			format: { type: "string", enum: [...outputFormats] },
			content: { type: "string", description: "The generated file content." },
			...reportProperties,
		},
		["format", "content", "diagnostics", "dependencies"],
	),
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
	"config.check"
> = capability({
	id: "config.check",
	description:
		"Load and validate a CSS Forge configuration, and give its warnings: values that generate, but likely not as intended. Writes no file.",
	audience: everyone,
	readOnly: true,
	input: CheckInputSchema,
	output: objectSchema<CheckReport>(reportProperties, ["diagnostics", "dependencies"]),
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
	input: BuildInputSchema,
	payload: BuiltPayloadSchema,
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
		"Generate CSS custom properties, JSON, TypeScript and Style Dictionary tokens from a CSS Forge configuration.",
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
	capabilities: [tokensBuild, tokensGenerate, configCheck],
	events: [tokensBuilt],
});
