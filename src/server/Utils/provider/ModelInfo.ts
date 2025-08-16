type ClaudeModel = 'anthropic/claude-opus-4' | 'anthropic/claude-sonnet-4';

type GeminiModel =
	| 'google/gemini-2.5-flash-lite'
	| 'google/gemini-2.5-flash'
	| 'google/gemini-2.5-pro';

type OpenAiModel = 'openai/gpt-4o-mini' | 'openai/gpt-oss-120b';

type OtherModel =
	| 'moonshotai/kimi-k2'
	| 'qwen/qwen3-coder'
	| 'deepseek/deepseek-chat-v3-0324'
	| 'deepseek/deepseek-r1-0528';

export type LLMModel = ClaudeModel | GeminiModel | OpenAiModel | OtherModel;

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
	// OpenAI Models
	'openai/gpt-4o-mini': {
		context: 128_000,
		input_token_cost_per_m: 0.15,
		output_token_cost_per_m: 0.6,
	},
	'openai/gpt-oss-120b': {
		context: 131_072,
		input_token_cost_per_m: 0.25,
		output_token_cost_per_m: 0.69,
	},
	// Other Models
	'moonshotai/kimi-k2': {
		context: 32_768,
		input_token_cost_per_m: 0.14,
		output_token_cost_per_m: 2.49,
	},
	'qwen/qwen3-coder': {
		context: 262_144,
		input_token_cost_per_m: 0.3,
		output_token_cost_per_m: 1.2,
	},
	'deepseek/deepseek-chat-v3-0324': {
		context: 163_840,
		input_token_cost_per_m: 0.34,
		output_token_cost_per_m: 0.88,
	},
	'deepseek/deepseek-r1-0528': {
		context: 163_840,
		input_token_cost_per_m: 0.5,
		output_token_cost_per_m: 0.85,
	},
};
