import {OpenAI} from 'openai';
import {ToolDefinition} from './tools/index.js';
import {ChatCompletionTool} from 'openai/resources/chat/completions.mjs';
import Logger from '../Logger.js';

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
	) {
		let retries = 0;
		// Logger.info("Invoking OpenRouter with request: " + JSON.stringify(request));
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
				return await this.openai.chat.completions.create(request);
			} catch (e) {
				Logger.error(e, `Chat completion failed (attempt ${retries + 1}/3)`);
				retries++;
			}
		}
		const error = new Error('failed after three retries');
		Logger.error(error, 'Chat completion failed after all retry attempts');
		throw error;
	}
}
