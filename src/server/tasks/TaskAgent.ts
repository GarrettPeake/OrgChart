import {Agent, agents} from '../agents/Agents.js';
import {ChatMessage, ToolCall} from '../LLMProvider.js';
import {
	delegateWorkTool,
	delegateWorkToolName,
} from '../tools/DelegateWorkTool.js';
import Logger, {ContextLogger} from '../../Logger.js';
import {
	attemptCompletionToolDefinition,
	attemptCompletionToolName,
} from '../tools/AttemptCompletionTool.js';
import {tools} from '../tools/index.js';
import {StreamEvent} from '../../cli/EventStream.js';
import {
	TodoListItem,
	updateTodoListToolName,
} from '../tools/UpdateTodoListTool.js';
import {ModelInformation} from '../agents/ModelInfo.js';
import {CompletionUsage} from 'openai/resources.js';
import {getConfig} from '../utils/Configuration.js';

export type AgentStatus = 'executing' | 'waiting' | 'exited' | 'halted';

export class TaskAgent {
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
	private canceller: any = {};

	constructor(writeEvent: (event: StreamEvent) => void, agent: Agent) {
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
			return `Invalid tool use, unable to parse tool arguments: ${e}`;
		}

		try {
			if (toolName === delegateWorkToolName) {
				return this.delegateWork(args);
			}

			const tool = tools.find(i => i.name === toolName);
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
		} catch (e: any) {
			return `Failed to enact tool ${toolName}, received error: ${e.message}`;
		}
	}

	async delegateWork(args: any): Promise<string> {
		const targetAgent = agents[args.agentId];
		if (!targetAgent) {
			Logger.error(`Delegation failure - agent '${args.agentId}' not found`);
			return `Delegation failure - agent '${args.agentId}' not found`;
		}

		const childTaskRunner = new TaskAgent(this.writeEvent, targetAgent);
		this.children.push(childTaskRunner);
		return childTaskRunner.runTask(args.task);
	}

	updateUsages(usage: CompletionUsage) {
		// Update our context usage and cost usage
		this.contextPercent =
			usage.prompt_tokens / ModelInformation[this.agent.model].context;
		this.cost +=
			(usage.prompt_tokens / 1_000_000) *
			ModelInformation[this.agent.model].input_token_cost_per_m;
		this.cost +=
			(usage.completion_tokens / 1_000_000) *
			ModelInformation[this.agent.model].output_token_cost_per_m;
		Logger.info(`Request to ${this.agent.name} used ${usage.prompt_tokens}tok`);
	}

	addToContext(message: ChatMessage) {
		this.context.push(message);
		ContextLogger.getAgentLogger(this.agentId)();
	}

	/**
	 * Cancel the currently executing task
	 * @returns boolean denoting whether there was a task to cancel
	 */
	cancelTask() {
		if (this.canceller.cancel) {
			this.canceller.cancel();
			this.canceller = {};
			return true;
		}
		return false;
	}

	/**
	 * Main task loop modifying context as it progresses
	 * @param input The user message to append to the current context before starting the cycles with the LLM
	 * @returns A task completion message when the LLM has enacted complete task
	 */
	async runTask(input: string): Promise<string> {
		this.cancelTask();
		const token = {isCancelled: false};
		this.canceller.cancel = () => (token.isCancelled = true);
		return this.runTaskCancellable(input, token);
	}

	private async runTaskCancellable(input: string, token: any): Promise<string> {
		try {
			this.writeEvent({
				title: `Task Started - ${this.agent.name}`,
				content: `${input}`,
			});

			this.addToContext({
				role: 'user',
				content: input,
			});

			let tools = this.agent.tools();
			if (this.agent.level > 0) {
				tools = tools.concat([delegateWorkTool(this.agent.level)]);
			}

			let iterations = 0;
			const maxIterations = getConfig().maxAgentIterations; // Prevent infinite loops

			while (iterations < maxIterations) {
				this.status = 'executing';
				iterations++;

				if (token.isCancelled) {
					this.writeEvent({
						title: `Task Cancelled - ${this.agent.name}`,
						content: '',
					});
					this.status = 'halted';
					while ((this.status = 'halted')) {} // Pause this agent until and external process modifies it's status
				}

				// On the final iteration, tell the agent that it is being forced to complete the task with the knowledge it already has
				if (iterations === maxIterations - 1) {
					this.addToContext({
						role: 'user',
						content: `You have run out of time and must provide a response to the requester given the information you already have/work you've already completed. If you were unable to finish the task completely, ensure the requester is made aware and you provide enough context for the requester to continue the task where you left off`,
					});
				}

				// Call the LLM
				const response = await getConfig().llmProvider.chatCompletion(
					{
						model: this.agent.model,
						messages: this.context,
						tool_choice: 'required',
						temperature: this.agent.temperature,
						stream: false,
					},
					iterations !== maxIterations - 1 // On the final iteration, only give the model the complete work tool
						? tools
						: [attemptCompletionToolDefinition],
				);

				// Update our context usage and cost usage
				if (response.usage) {
					this.updateUsages(response.usage);
				}

				// Extract the information we care about
				const choice = response.choices[0];
				const message = response.choices[0]?.message;

				// Handle the LLM not producing a response
				if (!choice || !message) {
					this.writeEvent({
						title: 'LLM API Error',
						content: 'No response, retrying',
					});
					continue;
				}
				// Handle API errors
				if (response.id === 'failure') {
					this.writeEvent({
						title: 'LLM API Error',
						content: choice?.message.content!,
					});
					// Realistically we just want to pause here
					// TODO: Prompt user for permission to proceed then just infinitely retry
					return 'Failed to continue work due to unforeseen accident'; // This message will be shown to the requesting agent and is meant to sound work-like
				}

				// Add assistant message to context
				this.addToContext({
					role: 'assistant',
					content: message.content,
					tool_calls: message.tool_calls,
				});

				// Handle tool calls
				if (message.tool_calls && message.tool_calls.length > 0) {
					for (const toolCall of message.tool_calls) {
						this.status = 'waiting';
						const toolResult = await this.executeToolCall(toolCall);
						Logger.info(
							`Agent: ${this.agent.name} used ${
								toolCall.function.name
							} and received ${toolResult.slice(0, 50)}`,
						);

						// Add tool result to context
						this.addToContext({
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
			}
			this.writeEvent({
				title: `Agent Max Cycles Exceeded (${maxIterations})`,
				content: 'Please instruct the agent to continue or correct it',
			});
			Logger.info('Loop detected, the user will need to manually continue');
			return `Forced to stop work after after ${maxIterations} turns`;
		} catch (error) {
			Logger.error(error, 'Task execution failed');
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';
			this.writeEvent({title: 'Task Error', content: errorMessage});
			return errorMessage;
		} finally {
			this.status = 'waiting';
		}
	}
}
