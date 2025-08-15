// ========================================================================================================================
//                                                      Request Types
// ========================================================================================================================

export type CompletionTextContentPart = {
	type: 'text';
	text: string;
	cache_control: {
		type: 'ephemeral';
	};
};

export type CompletionImageContentPart = {
	type: 'image_url';
	image_url: {
		url: string; // URL or base64 encoded image data
		detail?: string; // Optional, defaults to "auto"
	};
};

export type CompletionContentPart =
	| CompletionTextContentPart
	| CompletionImageContentPart;

export type CompletionInputMessage =
	| {
			role: 'user' | 'assistant' | 'system';
			// ContentParts are only for the "user" role:
			content: string | CompletionContentPart[];
			// If "name" is included, it will be prepended like this
			// for non-OpenAI models: `{name}: {content}`
			name?: string;
	  }
	| {
			role: 'tool';
			content: string;
			tool_call_id: string;
			name?: string;
	  }
	| {
			role: 'assistant';
			content: string | null;
			tool_calls?: ToolCall[];
	  };

export interface CompletionReasoningParams {
	effort?: 'high' | 'medium' | 'low';
	max_tokens?: number;
	exclude?: boolean; // Whether to exclude reasoning from the response, defaults to false
}

export type CompletionToolDescription = {
	description?: string;
	name: string;
	parameters: object; // JSON Schema object
};

export type CompletionTool = {
	type: 'function';
	function: CompletionToolDescription;
};

export type CompletionToolChoice = 'none' | 'auto' | 'required';

export type QuantizationOption =
	| 'int4'
	| 'int8'
	| 'fp4'
	| 'fp6'
	| 'fp8'
	| 'fp16'
	| 'bf16'
	| 'fp32'
	| 'unknown';

export interface CompletionProviderPreferences {
	sort?: 'price' | 'throughput' | 'latency'; // If enabled, load balancing is disabledd
	data_collection?: 'allow' | 'deny'; // Default is allow
	quantizations?: QuantizationOption[];
	max_price?: {
		prompt?: number; // Price per million tokens
		completion?: number; // Price per million tokens
	};
}

export interface ChatCompletionRequest {
	// Either "messages" or "prompt" is required
	messages?: CompletionInputMessage[];
	prompt?: string;

	reasoning?: CompletionReasoningParams;
	usage?: {
		include: boolean;
	};

	// If "model" is unspecified, uses the user's default
	model?: string; // See "Supported Models" section

	// Allows to force the model to produce specific output format.
	// See models page and note on this docs page for which models support it.
	response_format?: {type: 'json_schema'; json_schema: any};

	stop?: string | string[];
	stream?: boolean; // Enable streaming

	// See LLM Parameters (openrouter.ai/docs/api-reference/parameters)
	max_tokens?: number; // Range: [1, context_length)
	temperature?: number; // Range: [0, 2]

	// Tool calling
	// Will be passed down as-is for providers implementing OpenAI's interface.
	// For providers with custom interfaces, we transform and map the properties.
	// Otherwise, we transform the tools into a YAML template. The model responds with an assistant message.
	// See models supporting tool calling: openrouter.ai/models?supported_parameters=tools
	tools?: CompletionTool[];
	tool_choice?: CompletionToolChoice;
	parallel_tool_calls?: boolean; // Default true

	// Advanced optional parameters
	seed?: number; // Integer only
	top_p?: number; // Range: (0, 1]
	top_k?: number; // Range: [1, Infinity) Not available for OpenAI models
	frequency_penalty?: number; // Range: [-2, 2]
	presence_penalty?: number; // Range: [-2, 2]
	repetition_penalty?: number; // Range: (0, 2]
	logit_bias?: {[key: number]: number};
	top_logprobs?: number; // Integer only
	min_p?: number; // Range: [0, 1]
	top_a?: number; // Range: [0, 1]

	// Reduce latency by providing the model with a predicted output
	// https://platform.openai.com/docs/guides/latency-optimization#use-predicted-outputs
	prediction?: {type: 'content'; content: string};

	// OpenRouter-only parameters
	// See "Prompt Transforms" section: openrouter.ai/docs/transforms
	transforms?: string[];
	// See "Model Routing" section: openrouter.ai/docs/model-routing
	models?: string[];
	route?: 'fallback';
	// See "Provider Routing" section: openrouter.ai/docs/provider-routing
	provider?: CompletionProviderPreferences;
	user?: string; // A stable identifier for your end-users. Used to help detect and prevent abuse.
}

export type CompletionUsageStats = {
	completion_tokens: number;
	completion_tokens_details: {
		cached_tokens?: number;
	};
	cost: number;
	cost_details: {
		upstream_inference_cost: number; // Only used in BYOK situations
	};
	prompt_tokens: number;
	prompt_tokens_details: {
		reasoning_tokens?: number;
	};
	total_tokens: number;
};

// ========================================================================================================================
//                                                      Response Types
// ========================================================================================================================

export type CompletionFinishReason =
	| 'stop'
	| 'tool_calls'
	| 'length'
	| 'content_filter'
	| 'error';

export type ErrorResponse = {
	code: number; // See "Error Handling" section
	message: string;
	metadata?: Record<string, unknown>; // Contains additional error information such as provider details, the raw error message, etc.
};

export interface ToolCall {
	id: string;
	function: {
		arguments: string;
		name: string;
	};
	type: 'function';
}

/**
 * Output shape when streaming = false and messages was sent
 */
export type NonStreamingChoice = {
	finish_reason: CompletionFinishReason;
	native_finish_reason: string | null;
	message: {
		content: string | null;
		role: string;
		tool_calls?: ToolCall[];
	};
	error?: ErrorResponse;
};

/**
 * Output shape when streaming = true
 */
export type StreamingChoice = {
	finish_reason: CompletionFinishReason;
	native_finish_reason: string | null;
	delta: {
		content: string | null;
		role?: string;
		tool_calls?: ToolCall[];
	};
	error?: ErrorResponse;
};

export type ChatCompletionResponse = {
	id: string;
	// Depending on whether you set "stream" to "true" and
	// whether you passed in "messages" or a "prompt", you
	// will get a different output shape
	choices: NonStreamingChoice[];
	created: number; // Unix timestamp
	model: string;
	object: 'chat.completion';

	// Usage data is always returned for non-streaming.
	// When streaming, you will get one usage object at
	// the end accompanied by an empty choices array.
	usage?: CompletionUsageStats;
};

export type ChatCompletionStreamingResponse = {
	id: string;
	// Depending on whether you set "stream" to "true" and
	// whether you passed in "messages" or a "prompt", you
	// will get a different output shape
	choices: StreamingChoice[];
	created: number; // Unix timestamp
	model: string;
	object: 'chat.completion.chunk';

	// Usage data is always returned for non-streaming.
	// When streaming, you will get one usage object at
	// the end accompanied by an empty choices array.
	usage?: CompletionUsageStats;
};
