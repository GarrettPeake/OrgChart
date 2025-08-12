import {ToolDefinition} from '../../tools/index.js';
import {
	ChatCompletionRequest,
	ChatCompletionResponse,
	CompletionTool,
} from './OpenRouter.js';

/**
 * Note, appending `:online` to the model slug will append web search results from exa!
 * https://openrouter.ai/docs/features/web-search $4 per 1000 results
 */

const convertTools = (toolDefinitions: ToolDefinition[]): CompletionTool[] =>
	toolDefinitions.map(tool => ({
		type: 'function',
		function: {
			name: tool.name,
			description: tool.descriptionForAgent,
			parameters: tool.inputSchema,
		},
	}));

export class LLMProvider {
	private apiKey: string;
	private completionUrl: string;

	constructor(
		apiKey?: string,
		baseUrl: string = 'https://openrouter.ai/api/v1',
	) {
		this.completionUrl = baseUrl + '/chat/completions';
		this.apiKey = apiKey || process.env['OPENROUTER_API_KEY'] || '';

		if (!this.apiKey) {
			const error = new Error(
				'OpenRouter API key is required. Set OPENROUTER_API_KEY environment variable.',
			);
			throw error;
		}
	}

	async chatCompletion(
		request: ChatCompletionRequest,
		tools: ToolDefinition[],
	): Promise<ChatCompletionResponse> {
		const Logger = (await import('@/Logger.js')).default; // Solves the config -> llmProvider -> logger -> config circular import
		let retries = 0;
		let finalError: Error | null = null;
		while (retries < 3) {
			try {
				request = {
					...request,
					tools: tools.length > 0 ? convertTools(tools) : undefined,
					tool_choice: tools.length > 0 ? 'required' : undefined,
					usage: {include: true},
				};
				const response = (await fetch(this.completionUrl, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${this.apiKey}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(request),
				}).then(e => e.json())) as ChatCompletionResponse;
				// Append some random chars to the tool call ids so they are never repeated (OpenRouter API sometimes reuses tool ids confusing the models)
				if (response?.choices?.[0]?.message?.tool_calls) {
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
			created: 0,
			model: '',
			object: 'chat.completion',
			choices: [
				{
					finish_reason: 'stop',
					native_finish_reason: 'stop',
					message: {
						content: finalError!.message,
						role: 'assistant',
					},
				},
			],
		};
	}
}
