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
import {
	TodoListItem,
	updateTodoListToolName,
} from '../tools/UpdateTodoListTool.js';
import {ModelInformation} from '../agents/ModelInfo.js';

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
	public todoList: TodoListItem[] = [];
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
			return this.delegateWork(args);
		}

		const tool = tools[toolName];
		if (tool === undefined) {
			return 'Failed to use tool, no tool of that type exists';
		}

		this.writeEvent(await tool.formatEvent(args));

		if (toolName === attemptCompletionToolName) {
			return args.result;
		}

		if (toolName === updateTodoListToolName) {
			this.todoList = args;
		}
		return await tool.enact(args);
	}

	async delegateWork(args: any): Promise<string> {
		this.status = 'waiting';
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
			const maxIterations = 30; // Prevent infinite loops

			while (iterations < maxIterations) {
				this.status = 'executing';
				iterations++;

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

				// Update our context and cost usage
				if (response.usage) {
					this.contextPercent =
						response.usage?.prompt_tokens /
						ModelInformation[this.agent.model].context;
					this.cost +=
						(response.usage?.prompt_tokens / 1_000_000) *
						ModelInformation[this.agent.model].input_token_cost_per_m;
					this.cost +=
						(response.usage?.completion_tokens / 1_000_000) *
						ModelInformation[this.agent.model].output_token_cost_per_m;
				}

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
							contextLogger();
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
			this.writeEvent({
				title: `Agent Max Cycles Exceeded (${maxIterations})`,
				content: 'Please instruct the agent to continue or correct it',
			});
			Logger.info('Loop detected, the user will need to manually continue');
			return `Stopped after ${maxIterations} tool uses`;
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
