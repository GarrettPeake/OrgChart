import {Agent, agents} from '../agents/Agents.js';
import {LLMProvider, ChatMessage, ToolCall} from '../LLMProvider.js';
import {
	delegateWorkTool,
	delegateWorkToolName,
} from '../tools/DelegateWorkTool.js';
import Logger, {ContextLogger} from '../../Logger.js';
import {attemptCompletionToolName} from '../tools/AttemptCompletionTool.js';
import {tools} from '../tools/index.js';
import {StreamEvent} from '../../cli/EventStream.js';

export type AgentStatus = 'executing' | 'waiting' | 'exited';

export class TaskAgent {
	private llmProvider: LLMProvider;
	private writeEvent: (event: StreamEvent) => void;
	public agent: Agent;
	public children: TaskAgent[] = [];
	public status: AgentStatus = 'waiting';
	public cost: number = 0.0;
	public contextPercent: number = 0.000001;
	public agentId: string = crypto.randomUUID();
	// Initialize context with system prompt and user input
	public context: ChatMessage[];

	constructor(
		llmProvider: LLMProvider,
		writeEvent: (event: StreamEvent) => void,
		agent: Agent,
	) {
		this.llmProvider = llmProvider;
		this.writeEvent = writeEvent;
		this.agent = agent;
		this.context = [
			{
				role: 'system',
				content: agent.system_prompt(),
			},
		];
	}

	private async executeToolCall(toolCall: ToolCall): Promise<string> {
		const toolName = toolCall.function.name;
		let args: any;

		try {
			args = JSON.parse(toolCall.function.arguments);
		} catch (e) {
			Logger.error(e, `Error parsing tool arguments for ${toolName}`);
			throw `Error parsing tool arguments: ${e}`;
		}

		if (toolName === delegateWorkToolName) {
			const targetAgent = agents[args.agentId];
			if (!targetAgent) {
				Logger.error(
					new Error(`Agent ${args.agentId} not found`),
					'Delegation failure - agent not found',
				);
				throw 'Delegation failure';
			}

			const childTaskRunner = new TaskAgent(
				this.llmProvider,
				this.writeEvent,
				targetAgent,
			);
			this.children.push(childTaskRunner);
			return childTaskRunner.runTask(args.task);
		}

		const tool = tools[toolName];
		if (tool === undefined) {
			return 'Failed to invoke tool, no tool of that type exists';
		}

		this.writeEvent(await tool.formatEvent(args));

		if (toolName === attemptCompletionToolName) {
			return args.result;
		}
		return await tool.enact(args);
	}

	/**
	 * Main task loop modifying context as it progresses
	 * @param input The user message to append to the current context before starting the cycles with the LLM
	 * @returns A task completion message when the LLM has enacted complete task
	 */
	async runTask(input: string): Promise<string> {
		const contextLogger = ContextLogger.getAgentLogger(this.agentId);
		try {
			this.writeEvent({
				title: `Task Started - ${this.agent.name}`,
				content: `${input}`,
			});

			this.context.push({
				role: 'user',
				content: input,
			});

			let tools = this.agent.tools();
			if (this.agent.level > 0) {
				tools = tools.concat([delegateWorkTool(this.agent.level)]);
			}

			let iterations = 0;
			const maxIterations = 150; // Prevent infinite loops

			while (iterations < maxIterations) {
				this.status = 'executing';
				iterations++;
				this.cost += 1;

				const response = await this.llmProvider.chatCompletion(
					{
						model: this.agent.model,
						messages: this.context,
						tool_choice: 'required',
						temperature: this.agent.temperature,
						stream: false,
					},
					tools,
				);

				Logger.info(
					`Request to ${this.agent.name} used ${response.usage?.prompt_tokens}tok`,
				);

				const message = response.choices[0]?.message;

				if (!message) {
					Logger.warn('No response received from LLM');
					throw 'No response from LLM';
				}

				// A small hack to circumvent a bug in the OpenRouter API, append some random chars to the tool call ids so they are never repeated
				message.tool_calls = message.tool_calls?.map(tc => ({
					...tc,
					id: tc.id + '-' + crypto.randomUUID().substring(0, 6),
				}));

				// Add assistant message to context
				this.context.push({
					role: 'assistant',
					content: message.content,
					tool_calls: message.tool_calls,
				});

				// Handle tool calls
				if (message.tool_calls && message.tool_calls.length > 0) {
					this.status = 'waiting';
					for (const toolCall of message.tool_calls) {
						const toolResult = await this.executeToolCall(toolCall);
						Logger.info(
							`Agent: ${this.agent.name} used ${
								toolCall.function.name
							} and received ${toolResult.slice(0, 50)}`,
						);

						// Add tool result to context
						this.context.push({
							role: 'tool',
							content: toolResult,
							tool_call_id: toolCall.id,
						});

						// Check if task is complete
						if (toolCall.function.name === attemptCompletionToolName) {
							this.status = 'exited';
							return toolResult;
						}
					}
				} else {
					// No tool calls, task might be complete or need clarification
					Logger.warn('LLM provided no tool calls');
					throw 'No Tool Calls';
				}
				contextLogger();
			}
			throw 'Infinite loop detected';
		} catch (error) {
			Logger.error(error, 'Task execution failed');
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';
			this.writeEvent({title: 'Task Error', content: errorMessage});
			throw error;
		} finally {
			this.status = 'waiting';
		}
	}
}
