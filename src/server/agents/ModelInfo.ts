type ClaudeModel = 'anthropic/claude-opus-4' | 'anthropic/claude-sonnet-4';

type GeminiModel =
	| 'google/gemini-2.5-flash-lite'
	| 'google/gemini-2.5-flash'
	| 'google/gemini-2.5-pro';

type OtherModel = 'moonshotai/kimi-k2' | 'qwen/qwen3-coder';

export type LLMModel = ClaudeModel | GeminiModel | OtherModel;

export type ModelInfo = {
	context: number;
	input_token_cost_per_m: number;
	output_token_cost_per_m: number;
};

export const ModelInformation: Record<LLMModel, ModelInfo> = {
	// Claude models
	'anthropic/claude-opus-4': {
		context: 200_000,
		input_token_cost_per_m: 15.0,
		output_token_cost_per_m: 75.0,
	},
	'anthropic/claude-sonnet-4': {
		context: 200_000,
		input_token_cost_per_m: 3.0,
		output_token_cost_per_m: 15.0,
	},
	// Gemini Models
	'google/gemini-2.5-flash-lite': {
		context: 1_048_576,
		input_token_cost_per_m: 0.3,
		output_token_cost_per_m: 2.5,
	},
	'google/gemini-2.5-flash': {
		context: 1_048_576,
		input_token_cost_per_m: 0.1,
		output_token_cost_per_m: 0.4,
	},
	'google/gemini-2.5-pro': {
		context: 1_048_576,
		input_token_cost_per_m: 1.25,
		output_token_cost_per_m: 10.0,
	},
	// Other Models
	'moonshotai/kimi-k2': {
		context: 32_768,
		input_token_cost_per_m: 0.088,
		output_token_cost_per_m: 0.088,
	},
	'qwen/qwen3-coder': {
		context: 262_144,
		input_token_cost_per_m: 0.3,
		output_token_cost_per_m: 1.2,
	},
};
