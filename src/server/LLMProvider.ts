import {OpenAI} from 'openai';
import {ToolDefinition} from './tools/index.js';
import {ChatCompletionTool} from 'openai/resources/chat/completions.mjs';

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;
export type ChatCompletionRequest =
	OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
export type ChatCompletionResponse = OpenAI.Chat.Completions.ChatCompletion;

export class LLMProvider {
	private openai: OpenAI;

	constructor(
		apiKey?: string,
		baseUrl: string = 'https://openrouter.ai/api/v1',
	) {
		const key = apiKey || process.env['OPENROUTER_API_KEY'] || '';

		if (!key) {
			const error = new Error(
				'OpenRouter API key is required. Set OPENROUTER_API_KEY environment variable.',
			);
			Logger.error(
				error,
				'LLMProvider initialization failed - missing API key',
			);
			throw error;
		}

		this.openai = new OpenAI({
			apiKey: key,
			baseURL: baseUrl,
		});
	}

	async chatCompletion(
		request: ChatCompletionRequest,
		tools: ToolDefinition[],
	): Promise<ChatCompletionResponse> {
		let retries = 0;
		let finalError: Error | null = null;
		const Logger = await import('@/Logger.js'); // Handle a config -> llmProvider -> logger -> config circular import
		while (retries < 3) {
			try {
				const openAItools = tools.map(
					tool =>
						({
							type: 'function',
							function: {
								name: tool.name,
								description: tool.descriptionForAgent,
								parameters: tool.inputSchema,
							},
						} as ChatCompletionTool),
				);
				request.tools = openAItools;
				request.tool_choice = 'required';
				const response = await this.openai.chat.completions.create(request);
				// A small hack to circumvent a bug in the OpenRouter API, append some random chars to the tool call ids so they are never repeated
				if (response.choices[0]?.message.tool_calls) {
					response.choices[0].message.tool_calls =
						response.choices[0]?.message.tool_calls?.map(tc => ({
							...tc,
							id: tc.id + '-' + crypto.randomUUID().substring(0, 6),
						}));
				}
				return response;
			} catch (e: any) {
				finalError = e;
				Logger.error(e, `Chat completion failed (attempt ${retries + 1}/3)`);
				retries++;
			}
		}
		// If we've exceed three retries, return a failure
		Logger.error(finalError, 'Chat completion failed after all retry attempts');
		return {
			id: 'failure',
			created: 1,
			model: request.model,
			object: 'chat.completion',
			choices: [
				{
					finish_reason: 'stop',
					index: 0,
					logprobs: {} as any,
					message: {
						content: finalError!.message,
						refusal: null,
						role: 'assistant',
					},
				},
			],
		};
	}
}
